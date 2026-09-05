import Foundation

public enum APIError: LocalizedError {
  case notAuthenticated
  case serverMessage(String)
  case decoding
  case offline

  public var errorDescription: String? {
    switch self {
    case .notAuthenticated: return "Sign in first — your library is private to you."
    case .serverMessage(let m): return m
    case .decoding: return "Couldn't read the server's reply. Try again."
    case .offline: return "You're offline. Saved to the outbox — we'll send it later."
    }
  }
}

/// Generic bearer-token client. Same auth path agents use over MCP/CLI.
public final class APIClient: Sendable {
  public let baseURL: URL
  public let token: @Sendable () -> String?

  public init(baseURL: URL, token: @escaping @Sendable () -> String?) {
    self.baseURL = baseURL
    self.token = token
  }

  private var decoder: JSONDecoder {
    let d = JSONDecoder()
    d.dateDecodingStrategy = .iso8601
    return d
  }

  @discardableResult
  public func request<T: Decodable>(_ path: String, method: String = "GET", body: Encodable? = nil) async throws -> T {
    guard let tok = token(), !tok.isEmpty else { throw APIError.notAuthenticated }
    var req = URLRequest(url: baseURL.appendingPathComponent(path))
    req.httpMethod = method
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
    if let body {
      req.httpBody = try JSONEncoder().encode(AnyEncodable(body))
    }
    let (data, _) = try await URLSession.shared.data(for: req)
    if let err = try? decoder.decode(ErrorPayload.self, from: data), !err.error.isEmpty {
      // Heuristic: {error} payloads come with non-2xx; try to detect via message presence + failed decode below.
      // Attempt the success decode first; fall back to the error.
      if (try? decoder.decode(T.self, from: data)) == nil {
        throw APIError.serverMessage(err.error)
      }
    }
    do {
      return try decoder.decode(T.self, from: data)
    } catch {
      if let err = try? decoder.decode(ErrorPayload.self, from: data) {
        throw APIError.serverMessage(err.error)
      }
      throw APIError.decoding
    }
  }

  // MARK: - Endpoints

  public struct TokenResponse: Decodable { public var token: String }

  public static func signInForToken(baseURL: URL, email: String, password: String) async throws -> String {
    var req = URLRequest(url: baseURL.appendingPathComponent("/api/auth/token"))
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try JSONEncoder().encode(["email": email, "password": password])
    let (data, _) = try await URLSession.shared.data(for: req)
    let d = JSONDecoder()
    if let err = try? d.decode(ErrorPayload.self, from: data) {
      // If it also decodes as token, prefer token; else throw.
      if (try? d.decode(TokenResponse.self, from: data)) == nil {
        throw APIError.serverMessage(err.error)
      }
    }
    return try d.decode(TokenResponse.self, from: data).token
  }

  public func capture(url: String) async throws -> HoardItem {
    try await request("/api/capture", method: "POST", body: ["url": url])
  }

  public func captureText(title: String, text: String) async throws -> HoardItem {
    try await request("/api/capture", method: "POST", body: ["title": title, "text": text])
  }

  public func items(status: String? = nil) async throws -> [HoardItem] {
    // /api/items returns tags as [String]; map through a lenient DTO.
    struct DTO: Decodable {
      var id: String; var type: String; var title: String
      var sourceUrl: String?; var markdown: String; var excerpt: String
      var status: String; var createdAt: Date
    }
    let path = status.map { "/api/items?status=\($0)" } ?? "/api/items"
    let rows: [DTO] = try await request(path)
    return rows.map {
      HoardItem(id: $0.id, type: $0.type, title: $0.title, sourceUrl: $0.sourceUrl,
                markdown: $0.markdown, excerpt: $0.excerpt, status: $0.status,
                createdAt: $0.createdAt, tags: nil)
    }
  }

  public func updateItem(id: String, status: String) async throws -> HoardItem {
    struct DTO: Decodable {
      var id: String; var type: String; var title: String
      var sourceUrl: String?; var markdown: String; var excerpt: String
      var status: String; var createdAt: Date
    }
    let row: DTO = try await request("/api/items/\(id)", method: "PATCH", body: ["status": status])
    return HoardItem(id: row.id, type: row.type, title: row.title, sourceUrl: row.sourceUrl,
                     markdown: row.markdown, excerpt: row.excerpt, status: row.status,
                     createdAt: row.createdAt, tags: nil)
  }

  public func item(id: String) async throws -> HoardItem {
    struct DTO: Decodable {
      var id: String; var type: String; var title: String
      var sourceUrl: String?; var markdown: String; var excerpt: String
      var status: String; var createdAt: Date; var tags: [String]?
    }
    let row: DTO = try await request("/api/items/\(id)")
    return HoardItem(id: row.id, type: row.type, title: row.title, sourceUrl: row.sourceUrl,
                     markdown: row.markdown, excerpt: row.excerpt, status: row.status,
                     createdAt: row.createdAt, tags: row.tags)
  }

  public func notes() async throws -> [HoardNote] {
    try await request("/api/notes")
  }

  public func note(id: String) async throws -> HoardNote {
    try await request("/api/notes/\(id)")
  }

  public func createNote(title: String) async throws -> HoardNote {
    try await request("/api/notes", method: "POST", body: ["title": title])
  }

  public func saveNote(id: String, markdown: String, summary: String) async throws -> HoardNote {
    try await request("/api/notes/\(id)", method: "PATCH", body: ["markdown": markdown, "summary": summary])
  }

  public func search(q: String) async throws -> [SearchHit] {
    try await request("/api/search?q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")")
  }

  public func issueToken() async throws -> String {
    struct Out: Decodable { var token: String }
    let out: Out = try await request("/api/tokens", method: "POST", body: ["client": "ios"])
    return out.token
  }
}

private struct AnyEncodable: Encodable {
  let value: Encodable
  init(_ value: Encodable) { self.value = value }
  func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
