import Foundation

public enum APIError: LocalizedError {
  case notAuthenticated
  case serverMessage(String)
  case decoding(String)
  case transport(Error)

  public var errorDescription: String? {
    switch self {
    case .notAuthenticated: return "Sign in first — your library is private to you."
    case .serverMessage(let m): return m
    case .decoding(let m): return "Couldn't read the server's reply (\(m)). Pull to retry."
    case .transport(let e): return "Network hiccup — \(e.localizedDescription)"
    }
  }
}

/// Bearer-token client. Same auth path agents use over MCP/CLI.
/// When the API sits behind Cloudflare Access, pass `accessHeaders`
/// (service-token headers, checked at the edge); identity still comes
/// from the Hoard bearer token.
public final class APIClient: Sendable {
  public let baseURL: URL
  public let token: @Sendable () -> String?
  public let accessHeaders: @Sendable () -> [String: String]

  public init(
    baseURL: URL,
    token: @escaping @Sendable () -> String?,
    accessHeaders: @escaping @Sendable () -> [String: String] = { [:] }
  ) {
    self.baseURL = baseURL
    self.token = token
    self.accessHeaders = accessHeaders
  }

  public static func makeDecoder() -> JSONDecoder {
    let d = JSONDecoder()
    d.dateDecodingStrategy = .custom { dec in
      let c = try dec.singleValueContainer()
      // Null → throw; optionals handle null before reaching here.
      let s = try c.decode(String.self)
      if let dt = HoardDates.parse(s) { return dt }
      throw DecodingError.dataCorruptedError(in: c, debugDescription: "bad date: \(s)")
    }
    return d
  }

  @discardableResult
  public func request<T: Decodable>(_ path: String, method: String = "GET", body: Encodable? = nil) async throws -> T {
    guard let tok = token(), !tok.isEmpty else { throw APIError.notAuthenticated }
    guard let url = URL(string: path, relativeTo: baseURL) else {
      throw APIError.serverMessage("Bad request path.")
    }
    var req = URLRequest(url: url)
    req.httpMethod = method
    req.timeoutInterval = 30
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
    for (key, value) in accessHeaders() where !value.isEmpty {
      req.setValue(value, forHTTPHeaderField: key)
    }
    if let body {
      req.httpBody = try JSONEncoder().encode(AnyEncodable(body))
    }
    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await URLSession.shared.data(for: req)
    } catch {
      throw APIError.transport(error)
    }
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    let decoder = Self.makeDecoder()
    if !(200...299).contains(status) {
      if let err = try? decoder.decode(ErrorPayload.self, from: data), !err.error.isEmpty {
        throw APIError.serverMessage(err.error)
      }
      if let err = try? JSONDecoder().decode(ErrorPayload.self, from: data), !err.error.isEmpty {
        throw APIError.serverMessage(err.error)
      }
      throw APIError.serverMessage("Request failed (\(status)). Try again.")
    }
    do {
      return try decoder.decode(T.self, from: data)
    } catch {
      // Server sometimes wraps errors with 2xx? Surface {error} if present.
      if let err = try? decoder.decode(ErrorPayload.self, from: data), !err.error.isEmpty {
        throw APIError.serverMessage(err.error)
      }
      throw APIError.decoding(error.localizedDescription)
    }
  }

  // MARK: - Capture

  public func capture(url: String) async throws -> HoardItem {
    try await request("/api/capture", method: "POST", body: ["url": url])
  }

  public func captureText(title: String, text: String) async throws -> HoardItem {
    try await request("/api/capture", method: "POST", body: ["title": title, "text": text])
  }

  // MARK: - Items

  /// `type` is a comma-separated list matched against `Item.type`
  /// (e.g. "repo", "x", "page,pdf"); `source` is a named collection
  /// (e.g. "arxiv") — both mirror the web section pages.
  public func items(status: String? = nil, type: String? = nil, source: String? = nil) async throws -> [HoardItem] {
    var query: [String] = []
    if let status, !status.isEmpty { query.append("status=\(status)") }
    func add(_ key: String, _ value: String?) {
      guard let value, !value.isEmpty else { return }
      let encoded = value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
      query.append("\(key)=\(encoded)")
    }
    add("type", type)
    add("source", source)
    let path = query.isEmpty ? "/api/items" : "/api/items?\(query.joined(separator: "&"))"
    return try await request(path)
  }

  public func item(id: String) async throws -> HoardItem {
    try await request("/api/items/\(id)")
  }

  public func updateItem(id: String, status: String) async throws -> HoardItem {
    // PATCH returns the bare row (no tags key) — decode leniently.
    struct DTO: Decodable {
      var id: String; var type: String; var title: String
      var sourceUrl: String?; var markdown: String; var excerpt: String
      var status: String; var createdAt: Date
      var tags: [String]?
      var author: String?; var publishedAt: Date?; var extractedAt: Date?
      var extractionError: String?
    }
    let row: DTO = try await request("/api/items/\(id)", method: "PATCH", body: ["status": status])
    return HoardItem(id: row.id, type: row.type, title: row.title, sourceUrl: row.sourceUrl,
                     markdown: row.markdown, excerpt: row.excerpt, status: row.status,
                     createdAt: row.createdAt, tags: row.tags, author: row.author,
                     publishedAt: row.publishedAt, extractedAt: row.extractedAt,
                     extractionError: row.extractionError)
  }

  public func deleteItem(id: String) async throws {
    struct Ok: Decodable { var ok: Bool? }
    let _: Ok = try await request("/api/items/\(id)", method: "DELETE")
  }

  public func reprocess(id: String) async throws -> HoardItem {
    struct DTO: Decodable {
      var id: String; var type: String; var title: String
      var sourceUrl: String?; var markdown: String; var excerpt: String
      var status: String; var createdAt: Date; var tags: [String]?
      var author: String?; var publishedAt: Date?; var extractedAt: Date?
      var extractionError: String?
    }
    let row: DTO = try await request("/api/items/\(id)/reprocess", method: "POST")
    return HoardItem(id: row.id, type: row.type, title: row.title, sourceUrl: row.sourceUrl,
                     markdown: row.markdown, excerpt: row.excerpt, status: row.status,
                     createdAt: row.createdAt, tags: row.tags, author: row.author,
                     publishedAt: row.publishedAt, extractedAt: row.extractedAt,
                     extractionError: row.extractionError)
  }

  public func tags() async throws -> [HoardTag] {
    try await request("/api/tags")
  }

  // MARK: - Notes

  public func notes() async throws -> [HoardNote] {
    try await request("/api/notes")
  }

  public func note(id: String) async throws -> HoardNote {
    try await request("/api/notes/\(id)")
  }

  public func createNote(title: String) async throws -> HoardNote {
    try await request("/api/notes", method: "POST", body: ["title": title])
  }

  public func saveNote(id: String, title: String? = nil, markdown: String, summary: String) async throws -> HoardNote {
    var payload: [String: String] = ["markdown": markdown, "summary": summary]
    if let title { payload["title"] = title }
    return try await request("/api/notes/\(id)", method: "PATCH", body: payload)
  }

  public func deleteNote(id: String) async throws {
    struct Ok: Decodable { var ok: Bool? }
    let _: Ok = try await request("/api/notes/\(id)", method: "DELETE")
  }

  // MARK: - Search / tokens

  /// `type` scopes the hybrid search server-side, matching the web scope
  /// buttons: "" (all), "note", "x", "repo", "page,pdf".
  public func search(q: String, type: String? = nil) async throws -> [SearchHit] {
    let encoded = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
    var path = "/api/search?q=\(encoded)"
    if let type, !type.isEmpty {
      let t = type.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? type
      path += "&type=\(t)"
    }
    return try await request(path)
  }

  /// Rebuild the semantic (Vectorize) index. Returns the server's message.
  public func reindex() async throws -> String {
    struct Out: Decodable { var message: String?; var indexed: Int?; var total: Int?; var semantic: Bool? }
    let out: Out = try await request("/api/reindex", method: "POST")
    return out.message ?? "Reindexed \(out.indexed ?? 0) of \(out.total ?? 0)."
  }

  // MARK: - Discover

  /// Latest edition when `day`/`slot` are nil; otherwise a pinned edition.
  public func discovery(day: String? = nil, slot: Int? = nil) async throws -> DiscoveryResponse {
    var path = "/api/discover"
    if let day, let slot { path += "?day=\(day)&slot=\(slot)" }
    return try await request(path)
  }

  public func startDiscovery(topics: String, seeds: [String], budget: Int) async throws -> DiscoveryResponse {
    struct Body: Encodable { let topics: String; let seeds: [String]; let budget: Int }
    return try await request("/api/discover", method: "POST",
                             body: Body(topics: topics, seeds: seeds, budget: budget))
  }

  public func updateDiscoveryArticle(id: String, status: String) async throws -> DiscoveryResponse {
    try await request("/api/discover", method: "PATCH", body: ["id": id, "status": status])
  }

  /// Lazily resolve a lead image for an article that arrived without one.
  public func discoverOgImage(url: String) async throws -> String? {
    struct Out: Decodable { var imageUrl: String? }
    let encoded = url.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? url
    let out: Out = try await request("/api/discover/og?url=\(encoded)")
    let value = out.imageUrl ?? ""
    return value.isEmpty ? nil : value
  }

  /// Enable/disable automatic 3-hourly editions and set the source collection.
  public func saveDiscoverySchedule(enabled: Bool, topics: String, budget: Int, sourceIds: [String]) async throws -> DiscoveryResponse {
    struct Body: Encodable { let enabled: Bool; let topics: String; let budget: Int; let sourceIds: [String] }
    return try await request("/api/discover", method: "PUT",
                             body: Body(enabled: enabled, topics: topics, budget: budget, sourceIds: sourceIds))
  }

  // MARK: - Highlights

  public func highlights(itemId: String) async throws -> [HoardHighlight] {
    try await request("/api/items/\(itemId)/highlights")
  }

  public func addHighlight(itemId: String, quote: String, note: String) async throws -> HoardHighlight {
    try await request("/api/items/\(itemId)/highlights", method: "POST", body: ["quote": quote, "note": note])
  }

  public func deleteHighlight(itemId: String, highlightId: String) async throws {
    struct Ok: Decodable { var ok: Bool? }
    let _: Ok = try await request("/api/items/\(itemId)/highlights/\(highlightId)", method: "DELETE")
  }

  public func issueToken() async throws -> String {
    struct Out: Decodable { var token: String }
    let out: Out = try await request("/api/tokens", method: "POST", body: ["client": "ios"])
    return out.token
  }

  public func tokenRows() async throws -> [AgentTokenRow] {
    try await request("/api/tokens")
  }
}

private struct AnyEncodable: Encodable {
  let value: Encodable
  init(_ value: Encodable) { self.value = value }
  func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
