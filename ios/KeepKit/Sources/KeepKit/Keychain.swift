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

  public static func saveToken(_ token: String) throws {
    let data = Data(token.utf8)
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

  public static func loadToken() -> String? {
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
    return String(data: data, encoding: .utf8)
  }

  public static func deleteToken() {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    if let g = accessGroup { query[kSecAttrAccessGroup as String] = g }
    SecItemDelete(query as CFDictionary)
  }

  public enum KeychainError: Error {
    case add(OSStatus)
  }
}
