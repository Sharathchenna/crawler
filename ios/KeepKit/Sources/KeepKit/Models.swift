import Foundation

// Codable models mirroring the Prisma shapes.
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
  public var author: String?
  public var publishedAt: Date?
  public var extractedAt: Date?
  public var extractionError: String?

  public var domain: String {
    guard let s = sourceUrl, let u = URL(string: s) else { return "" }
    return u.host?.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression) ?? ""
  }

  public var icon: String {
    switch type {
    case "pdf": return "doc.richtext"
    case "x": return "bird"
    case "repo": return "chevron.left.forwardslash.chevron.right"
    case "video": return "play.rectangle"
    case "audio": return "waveform"
    case "note": return "note.text"
    case "file": return "photo"
    case "page": return "doc.text"
    default: return "doc.text"
    }
  }

  public var tagList: [String] { tags ?? [] }

  public var timeAgo: String {
    let s = max(1, Int(Date().timeIntervalSince(createdAt)))
    if s < 60 { return "\(s)s ago" }
    if s < 3600 { return "\(s / 60)m ago" }
    if s < 86400 { return "\(s / 3600)h ago" }
    return "\(s / 86400)d ago"
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

  public var revisionCount: Int { revisions?.count ?? _count?.revisions ?? 0 }
  public var sourceCount: Int { sources?.count ?? _count?.sources ?? 0 }

  public var timeAgo: String {
    let s = max(1, Int(Date().timeIntervalSince(updatedAt)))
    if s < 60 { return "\(s)s ago" }
    if s < 3600 { return "\(s / 60)m ago" }
    if s < 86400 { return "\(s / 3600)h ago" }
    return "\(s / 86400)d ago"
  }
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
  public var via: String? // "keyword" | "fuzzy" | "semantic"
}

public struct HoardTag: Codable, Identifiable, Hashable {
  public var id: String
  public var name: String
}

/// A saved quote from an item (reader highlights).
public struct HoardHighlight: Codable, Identifiable, Hashable {
  public var id: String
  public var itemId: String?
  public var quote: String
  public var note: String?
  public var createdAt: Date
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

// MARK: - Discover (Tinyfish daily reading digest)

/// One article in an edition. `status`: unread | read | skipped | saved.
public struct DiscoveryArticle: Codable, Identifiable, Hashable {
  public var id: String
  public var url: String
  public var title: String
  public var author: String?
  public var summary: String
  public var reason: String
  public var minutes: Int
  public var status: String
  public var itemId: String?
  public var imageUrl: String?   // lead image (feed enclosure / og:image), "" when absent

  public var image: String { imageUrl ?? "" }
  public var domain: String {
    guard let u = URL(string: url) else { return "" }
    return u.host?.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression) ?? ""
  }
}

/// A 3-hour-slot edition. `status`: starting | running | ready | failed.
/// `origin`: "manual" | "scheduled".
public struct DiscoveryDigest: Codable, Identifiable, Hashable {
  public var id: String
  public var day: String
  public var slot: Int?
  public var topics: String
  public var seeds: String      // JSON-encoded [String]
  public var budget: Int
  public var status: String
  public var attempts: Int
  public var error: String?
  public var origin: String?
  public var articles: [DiscoveryArticle]

  public var slotValue: Int { slot ?? 0 }
  public var isScheduled: Bool { origin == "scheduled" }
  public var isRunning: Bool { status == "starting" || status == "running" }
  public var isReady: Bool { status == "ready" }
  public var isFailed: Bool { status == "failed" }
  public var remaining: [DiscoveryArticle] { articles.filter { $0.status == "unread" } }
  public var finished: [DiscoveryArticle] { articles.filter { $0.status != "unread" } }
  public var minutesLeft: Int { remaining.reduce(0) { $0 + $1.minutes } }
  /// A failed digest gets at most one explicit retry (attempts < 2), never for scheduled runs.
  public var canRetry: Bool { isFailed && attempts < 2 && !isScheduled }
  public var editionLabel: String { DiscoverySources.slotLabel(day: day, slot: slotValue) }
}

/// Remembered inputs from the most recent edition, to prefill the form.
public struct DiscoveryPreferences: Codable, Hashable {
  public var topics: String
  public var seeds: [String]
  public var budget: Int
}

/// One entry in the editions history picker.
public struct DiscoveryEdition: Codable, Hashable, Identifiable {
  public var day: String
  public var slot: Int
  public var status: String
  public var id: String { "\(day)|\(slot)" }
  public var label: String { DiscoverySources.slotLabel(day: day, slot: slot) }
}

public struct DiscoverySourceHealth: Codable, Hashable, Identifiable {
  public var id: String
  public var count: Int
  public var error: String?
}

/// The user's automatic-discovery schedule (fresh edition every 3 hours).
public struct DiscoverySchedule: Codable, Hashable {
  public var enabled: Bool
  public var topics: String
  public var budget: Int
  public var sourceIds: [String]
  public var nextRunAt: String?
  public var lastRunAt: String?
  public var lastError: String?
  public var sourceHealth: [DiscoverySourceHealth]?
}

public struct DiscoveryResponse: Codable {
  public var configured: Bool
  public var preferences: DiscoveryPreferences?
  public var digest: DiscoveryDigest?
  public var editionDay: String?
  public var editionSlot: Int?
  public var editions: [DiscoveryEdition]?
  public var schedule: DiscoverySchedule?

  public var editionList: [DiscoveryEdition] { editions ?? [] }
}

/// Lenient date parsing: Prisma emits ISO-8601 with fractional seconds
/// ("2026-09-05T07:57:52.743Z") which JSONDecoder.iso8601 rejects.
public enum HoardDates {
  private static let withFraction: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()
  private static let plain: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  public static func parse(_ s: String) -> Date? {
    if let d = withFraction.date(from: s) { return d }
    if let d = plain.date(from: s) { return d }
    // Fallbacks without timezone colon, etc.
    let fmts = ["yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd HH:mm:ss"]
    for fmt in fmts {
      let df = DateFormatter()
      df.locale = Locale(identifier: "en_US_POSIX")
      df.timeZone = TimeZone(secondsFromGMT: 0)
      df.dateFormat = fmt
      if let d = df.date(from: s) { return d }
    }
    return nil
  }
}
