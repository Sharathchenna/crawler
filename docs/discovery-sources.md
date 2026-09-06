# Daily tech source collection

Researched and feed endpoints checked on **2026-09-06**. This is a deliberately
small starter collection chosen for original reporting, practical explanations,
and a mix of independent authors and community discovery—not an objective ranking
of every tech publication. All 12 RSS/Atom endpoints responded successfully during
setup. Hacker News uses its [official public API](https://github.com/HackerNews/API).

| Source | What it adds |
| --- | --- |
| [Hacker News](https://news.ycombinator.com/) | Community-ranked original links, projects, and broad tech discovery. |
| [Simon Willison](https://simonwillison.net/) | Practical AI engineering, agents and tool experiments. |
| [Latent Space](https://www.latent.space/about) | AI engineering newsletter, interviews, models and infrastructure. |
| [The Pragmatic Engineer](https://newsletter.pragmaticengineer.com/about) | Engineering practices, teams and technology industry reporting. |
| [ByteByteGo](https://blog.bytebytego.com/) | System design and visual architecture explanations. |
| [Julia Evans](https://jvns.ca/) | Accessible, detailed explanations of systems and developer tools. |
| [Lenny's Newsletter](https://www.lennysnewsletter.com/) | Product building, startup growth and founder/operator interviews. |
| [The Bootstrapped Founder](https://thebootstrappedfounder.com/) | Independent business building and founder lessons. |
| [Ben Kuhn](https://www.benkuhn.net/) | Engineering effectiveness, teams and decision-making. |
| [Martin Fowler](https://martinfowler.com/) | Software architecture, refactoring and delivery practices. |
| [Cloudflare Blog](https://blog.cloudflare.com/) | First-party infrastructure and security engineering; includes product announcements. |
| [Krebs on Security](https://krebsonsecurity.com/) | Original cybersecurity investigations and reporting. |
| [Schneier on Security](https://www.schneier.com/) | Security analysis, technology and public policy. |

Substack is a publishing platform, so the crawler follows selected publications
rather than its recommendation feed. Some newsletters mix public and paid posts.
Only public feed content and publicly readable pages are used. A publisher preview
is explicitly labelled and should not be confused with a full-article summary.

Each daily scan fetches the feeds and the first 16 HN top-story records. HN links
need at least 20 points and be no older than three days. Feeds contribute up to
five recent entries each (30-day lookback). The shortlist balances categories
and publishers, excludes up to 200 saved and 200 previously discovered URLs,
and passes at most eight known URLs to a bounded Tinyfish reading task.

Sources can publish irregularly or be temporarily unavailable. A daily scan does
not guarantee an article from each source, and the digest does not refill to keep
you scrolling. Source-level errors and recent-link counts are visible in Discover.
