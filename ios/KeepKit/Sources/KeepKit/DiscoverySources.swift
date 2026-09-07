import Foundation

/// Mirror of the server's `lib/discovery-sources.ts` catalogue so the app can
/// render the schedule's source picker without an extra endpoint. Keep in sync.
public enum DiscoverySources {
  public static let slotHours = 3
  public static let slotsPerDay = 8
  public static let defaultTopics = "AI agents and developer tools; startups and indie building; systems, databases and security; a broad mix of thoughtful technology writing"

  public struct Source: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let category: String
    public let url: String
    public let description: String
  }

  public static let all: [Source] = [
    .init(id: "hn", name: "Hacker News", category: "Broad tech", url: "https://news.ycombinator.com/", description: "Community-ranked links to original articles and new projects."),
    .init(id: "simon", name: "Simon Willison", category: "AI & tools", url: "https://simonwillison.net/", description: "Hands-on AI engineering, agents and developer tools."),
    .init(id: "latent", name: "Latent Space", category: "AI & tools", url: "https://www.latent.space/", description: "AI engineering newsletter and technical interviews on Substack."),
    .init(id: "pragmatic", name: "The Pragmatic Engineer", category: "Engineering", url: "https://newsletter.pragmaticengineer.com/", description: "Engineering practices and the technology industry; public posts/previews."),
    .init(id: "bytebytego", name: "ByteByteGo", category: "Systems & security", url: "https://blog.bytebytego.com/", description: "System design, databases and architecture; public posts/previews."),
    .init(id: "julia", name: "Julia Evans", category: "Systems & security", url: "https://jvns.ca/", description: "Clear explanations of debugging, Git, Linux and networking."),
    .init(id: "lenny", name: "Lenny's Newsletter", category: "Startups & indie", url: "https://www.lennysnewsletter.com/", description: "Product building and startup growth; public posts/previews."),
    .init(id: "bootstrapped", name: "The Bootstrapped Founder", category: "Startups & indie", url: "https://thebootstrappedfounder.com/", description: "Practical lessons from independent founders."),
    .init(id: "ben", name: "Ben Kuhn", category: "Startups & indie", url: "https://www.benkuhn.net/", description: "Engineering, decision-making and building effective teams."),
    .init(id: "fowler", name: "Martin Fowler", category: "Engineering", url: "https://martinfowler.com/", description: "Software architecture, refactoring and delivery practices."),
    .init(id: "cloudflare", name: "Cloudflare Blog", category: "Systems & security", url: "https://blog.cloudflare.com/", description: "Internet infrastructure, systems engineering and security."),
    .init(id: "krebs", name: "Krebs on Security", category: "Systems & security", url: "https://krebsonsecurity.com/", description: "Original cybersecurity investigations and reporting."),
    .init(id: "schneier", name: "Schneier on Security", category: "Systems & security", url: "https://www.schneier.com/", description: "Security analysis at the intersection of technology and people."),
    .init(id: "huggingface", name: "Hugging Face", category: "AI & tools", url: "https://huggingface.co/blog", description: "Open-source models, datasets and ML tooling."),
    .init(id: "marktechpost", name: "MarkTechPost", category: "AI & tools", url: "https://marktechpost.com/", description: "ML model and tool releases with a practical lens."),
    .init(id: "gwern", name: "Gwern", category: "AI & tools", url: "https://gwern.net/", description: "Deep, infrequent essays on AI, statistics and safety."),
    .init(id: "github", name: "GitHub Blog", category: "Engineering", url: "https://github.blog/", description: "Developer tooling, platform changes and security advisories."),
    .init(id: "codinghorror", name: "Coding Horror", category: "Engineering", url: "https://blog.codinghorror.com/", description: "Jeff Atwood on software and programming culture."),
    .init(id: "platformer", name: "Platformer", category: "Broad tech", url: "https://www.platformer.news/", description: "Big tech, social platforms and power, by Casey Newton."),
    .init(id: "404media", name: "404 Media", category: "Broad tech", url: "https://www.404media.co/", description: "Independent investigations into internet culture and surveillance."),
    .init(id: "mittr", name: "MIT Technology Review", category: "Broad tech", url: "https://www.technologyreview.com/", description: "Forward-looking computing and AI journalism."),
    .init(id: "register", name: "The Register", category: "Broad tech", url: "https://www.theregister.com/", description: "Enterprise IT and DevOps with a skeptical voice."),
    .init(id: "bleeping", name: "BleepingComputer", category: "Systems & security", url: "https://www.bleepingcomputer.com/", description: "Security operations and vulnerability tracking."),
  ]

  public static var allIds: [String] { all.map(\.id) }

  /// "2026-09-06 · 15:00 UTC" label for an edition (mirrors server slotLabel).
  public static func slotLabel(day: String, slot: Int) -> String {
    let hour = String(format: "%02d", slot * slotHours)
    return "\(day) · \(hour):00 UTC"
  }
}
