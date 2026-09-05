import Foundation

/// Base URL config: dev localhost, release prod URL. Edit for your environment.
public enum HoardConfig {
  public static var baseURL: URL {
    #if DEBUG
    if let s = Bundle.main.object(forInfoDictionaryKey: "HoardAPIBaseURL") as? String, let u = URL(string: s) {
      return u
    }
    return URL(string: "http://localhost:3000")!
    #else
    if let s = Bundle.main.object(forInfoDictionaryKey: "HoardAPIBaseURL") as? String, let u = URL(string: s) {
      return u
    }
    return URL(string: "https://hoard.example.com")!
    #endif
  }

  public static var mcpURL: URL { baseURL.appendingPathComponent("/api/mcp") }
}
