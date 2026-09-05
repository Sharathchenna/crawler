import Foundation

/// Offline outbox shared with the Share Extension via App Group.
/// Never lose a save: enqueue when offline/unauthenticated, flush on next launch.
public enum Outbox {
  public struct Entry: Codable, Identifiable {
    public var id: String
    public var url: String?
    public var text: String?
    public var title: String?
    public var createdAt: Date
  }

  public static var groupID: String {
    Bundle.main.object(forInfoDictionaryKey: "AppGroupID") as? String ?? "group.com.hoard.app"
  }

  private static var fileURL: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID)?
      .appendingPathComponent("hoard-outbox.json")
  }

  public static func load() -> [Entry] {
    guard let url = fileURL,
          let data = try? Data(contentsOf: url),
          let entries = try? JSONDecoder().decode([Entry].self, from: data) else { return [] }
    return entries
  }

  public static func enqueue(url: String?, text: String?, title: String?) {
    var entries = load()
    entries.append(Entry(id: UUID().uuidString, url: url, text: text, title: title, createdAt: Date()))
    save(entries)
  }

  public static func save(_ entries: [Entry]) {
    guard let url = fileURL else { return }
    try? JSONEncoder().encode(entries).write(to: url, options: .atomic)
  }

  public static func remove(_ id: String) {
    save(load().filter { $0.id != id })
  }
}
