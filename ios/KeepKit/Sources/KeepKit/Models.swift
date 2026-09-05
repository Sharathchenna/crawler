import Foundation

// Codable models mirroring the Prisma shapes. ISO-8601 dates.
public struct HoardItem: Codable, Identifiable, Hashable {
  public var id: String
  public var type: String
  public var title: String
  public var sourceUrl: String?
  public var markdown: String
  public var excerpt: String
  public var status: String
  public var createdAt: Date
  public var tags: [String]?

  public var domain: String {
    guard let s = sourceUrl, let u = URL(string: s) else { return "" }
    return u.host?.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression) ?? ""
  }

  public var icon: String {
    switch type {
    case "pdf": return "doc.richtext"
    case "x": return "bubble.left"
    case "video": return "play.rectangle"
    case "audio": return "waveform"
    case "note": return "note.text"
    case "file": return "doc"
    default: return "doc.text"
    }
  }
}

public struct HoardNote: Codable, Identifiable, Hashable {
  public var id: String
  public var title: String
  public var markdown: String
  public var project: String
  public var kind: String
  public var createdAt: Date
  public var updatedAt: Date
  public var revisions: [HoardRevision]?
  public var sources: [HoardNoteSource]?
  public struct Count: Codable, Hashable { public var revisions: Int; public var sources: Int }
  public var _count: Count?
}

public struct HoardRevision: Codable, Hashable, Identifiable {
  public var id: String?
  public var version: Int
  public var author: String
  public var summary: String
  public var createdAt: Date
}

public struct HoardNoteSource: Codable, Hashable {
  public var item: HoardItemShort
  public struct HoardItemShort: Codable, Hashable {
    public var id: String
    public var title: String
  }
}

public struct SearchHit: Codable, Identifiable, Hashable {
  public var id: String
  public var kind: String // "item" | "note"
  public var title: String
  public var snippet: String
  public var type: String
  public var sourceUrl: String?
}

public struct HoardTag: Codable, Identifiable, Hashable {
  public var id: String
  public var name: String
}

public struct AgentTokenRow: Codable, Identifiable, Hashable {
  public var id: String
  public var client: String
  public var createdAt: Date
  public var lastUsedAt: Date?
}

public struct ErrorPayload: Codable {
  public var error: String
}
