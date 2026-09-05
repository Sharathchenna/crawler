import Foundation
import Security

/// Shared Keychain helper. Uses an access group so the app + Share Extension share the token.
/// Group must match entitlements: $(AppIdentifierPrefix)group.com.hoard.app
public enum HoardKeychain {
  public static var accessGroup: String? {
    // Set via Info.plist `KeychainAccessGroup`, else nil (works in simulator without group).
    Bundle.main.object(forInfoDictionaryKey: "KeychainAccessGroup") as? String
  }

  private static let service = "com.hoard.app.token"
  private static let account = "bearer"
  private static let accessAccount = "access"

  public struct AccessCredentials: Codable {
    public var id: String
    public var secret: String
    public init(id: String, secret: String) {
      self.id = id
      self.secret = secret
    }
  }

  private static func save(account: String, data: Data) throws {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    if let g = accessGroup { query[kSecAttrAccessGroup as String] = g }
    SecItemDelete(query as CFDictionary)
    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    let status = SecItemAdd(add as CFDictionary, nil)
    guard status == errSecSuccess else { throw KeychainError.add(status) }
  }

  private static func load(account: String) -> Data? {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    if let g = accessGroup { query[kSecAttrAccessGroup as String] = g }
    var out: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
          let data = out as? Data else { return nil }
    return data
  }

  private static func delete(account: String) {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    if let g = accessGroup { query[kSecAttrAccessGroup as String] = g }
    SecItemDelete(query as CFDictionary)
  }

  public static func saveToken(_ token: String) throws {
    try save(account: account, data: Data(token.utf8))
  }

  public static func loadToken() -> String? {
    guard let data = load(account: account) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  public static func deleteToken() {
    delete(account: account)
  }

  /// Cloudflare Access service-token pair (checked at the edge).
  public static func saveAccess(id: String, secret: String) throws {
    try save(account: accessAccount, data: try JSONEncoder().encode(AccessCredentials(id: id, secret: secret)))
  }

  public static func loadAccess() -> AccessCredentials? {
    guard let data = load(account: accessAccount) else { return nil }
    return try? JSONDecoder().decode(AccessCredentials.self, from: data)
  }

  public static func deleteAccess() {
    delete(account: accessAccount)
  }

  /// Header fields for Access-protected APIs (empty when not configured).
  public static func accessHeaderFields() -> [String: String] {
    guard let c = loadAccess(), !c.id.isEmpty, !c.secret.isEmpty else { return [:] }
    return ["CF-Access-Client-Id": c.id, "CF-Access-Client-Secret": c.secret]
  }

  public enum KeychainError: Error {
    case add(OSStatus)
  }
}
