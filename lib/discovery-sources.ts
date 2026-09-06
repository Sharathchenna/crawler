export const DEFAULT_TOPICS = "AI agents and developer tools; startups and indie building; systems, databases and security; a broad mix of thoughtful technology writing";
export const DAILY_HOUR_UTC = 1;
export const DISCOVERY_SOURCES = [
  { id: "hn", name: "Hacker News", category: "Broad tech", url: "https://news.ycombinator.com/", feed: "", description: "Community-ranked links to original articles and new projects." },
  { id: "simon", name: "Simon Willison", category: "AI & tools", url: "https://simonwillison.net/", feed: "https://simonwillison.net/atom/everything/", description: "Hands-on AI engineering, agents and developer tools." },
  { id: "latent", name: "Latent Space", category: "AI & tools", url: "https://www.latent.space/", feed: "https://www.latent.space/feed", description: "AI engineering newsletter and technical interviews on Substack." },
  { id: "pragmatic", name: "The Pragmatic Engineer", category: "Engineering", url: "https://newsletter.pragmaticengineer.com/", feed: "https://newsletter.pragmaticengineer.com/feed", description: "Engineering practices and the technology industry; public posts/previews." },
  { id: "bytebytego", name: "ByteByteGo", category: "Systems & security", url: "https://blog.bytebytego.com/", feed: "https://blog.bytebytego.com/feed", description: "System design, databases and architecture; public posts/previews." },
  { id: "julia", name: "Julia Evans", category: "Systems & security", url: "https://jvns.ca/", feed: "https://jvns.ca/atom.xml", description: "Clear explanations of debugging, Git, Linux and networking." },
  { id: "lenny", name: "Lenny's Newsletter", category: "Startups & indie", url: "https://www.lennysnewsletter.com/", feed: "https://www.lennysnewsletter.com/feed", description: "Product building and startup growth; public posts/previews." },
  { id: "bootstrapped", name: "The Bootstrapped Founder", category: "Startups & indie", url: "https://thebootstrappedfounder.com/", feed: "https://thebootstrappedfounder.com/feed/", description: "Practical lessons from independent founders." },
  { id: "ben", name: "Ben Kuhn", category: "Startups & indie", url: "https://www.benkuhn.net/", feed: "https://www.benkuhn.net/index.xml", description: "Engineering, decision-making and building effective teams." },
  { id: "fowler", name: "Martin Fowler", category: "Engineering", url: "https://martinfowler.com/", feed: "https://martinfowler.com/feed.atom", description: "Software architecture, refactoring and delivery practices." },
  { id: "cloudflare", name: "Cloudflare Blog", category: "Systems & security", url: "https://blog.cloudflare.com/", feed: "https://blog.cloudflare.com/rss/", description: "Internet infrastructure, systems engineering and security." },
  { id: "krebs", name: "Krebs on Security", category: "Systems & security", url: "https://krebsonsecurity.com/", feed: "https://krebsonsecurity.com/feed/", description: "Original cybersecurity investigations and reporting." },
  { id: "schneier", name: "Schneier on Security", category: "Systems & security", url: "https://www.schneier.com/", feed: "https://www.schneier.com/feed/atom/", description: "Security analysis at the intersection of technology and people." },
] as const;

export type SourceId = typeof DISCOVERY_SOURCES[number]["id"];
export type Candidate = {
  url: string; title: string; author: string; excerpt: string;
  source: string; category: string; publishedAt: string; score: number;
  imageUrl?: string;
};
export type SourceHealth = { id: string; count: number; error: string | null };

export function nextEditionAt(now = new Date()): string {
  const next = new Date(now);
  next.setUTCHours(DAILY_HOUR_UTC, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}
