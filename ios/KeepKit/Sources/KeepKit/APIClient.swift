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

  public func items(status: String? = nil) async throws -> [HoardItem] {
    let path = status.map { "/api/items?status=\($0)" } ?? "/api/items"
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

  public func search(q: String) async throws -> [SearchHit] {
    let encoded = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
    return try await request("/api/search?q=\(encoded)")
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
