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

/// One article in a daily edition. `status`: unread | read | skipped | saved.
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

  public var domain: String {
    guard let u = URL(string: url) else { return "" }
    return u.host?.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression) ?? ""
  }
}

/// A day's edition. `status`: starting | running | ready | failed.
public struct DiscoveryDigest: Codable, Identifiable, Hashable {
  public var id: String
  public var day: String
  public var topics: String
  public var seeds: String      // JSON-encoded [String]
  public var budget: Int
  public var status: String
  public var attempts: Int
  public var error: String?
  public var articles: [DiscoveryArticle]

  public var isRunning: Bool { status == "starting" || status == "running" }
  public var isReady: Bool { status == "ready" }
  public var isFailed: Bool { status == "failed" }
  public var remaining: [DiscoveryArticle] { articles.filter { $0.status == "unread" } }
  public var finished: [DiscoveryArticle] { articles.filter { $0.status != "unread" } }
  public var minutesLeft: Int { remaining.reduce(0) { $0 + $1.minutes } }
  /// A ready failed digest gets at most one explicit retry (attempts < 2).
  public var canRetry: Bool { isFailed && attempts < 2 }
}

/// Remembered inputs from the most recent edition, to prefill the form.
public struct DiscoveryPreferences: Codable, Hashable {
  public var topics: String
  public var seeds: [String]
  public var budget: Int
}

public struct DiscoveryResponse: Codable {
  public var configured: Bool
  public var preferences: DiscoveryPreferences?
  public var digest: DiscoveryDigest?

  /// The form is offered when there is no edition yet, or a failed one can retry.
  public var canStart: Bool {
    guard let digest else { return true }
    return digest.canRetry
  }
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
