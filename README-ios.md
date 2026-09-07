# Hoard for iOS — README-ios

Native SwiftUI app mirroring the web product (dark-first `#080808`, Inter + JetBrains Mono, hairlines, green ticks only). Same backend API, bearer-token auth, plus a **Share Extension**.

## Layout

```
ios/
  KeepKit/                    Swift package (shared by app + extension)
    Sources/KeepKit/
      Theme.swift             Color/Font tokens (match web)
      Models.swift            Codable Item/Note/Revision/SearchHit/Tag
      APIClient.swift         bearer client: signInForToken, capture, items,
                              updateItem, notes, saveNote, search, issueToken
      Keychain.swift          shared Keychain (access group)
      MCPConfig.swift         port of web buildConfig(slug,name,url)
      Outbox.swift            App Group offline queue (JSON file)
  Hoard/                      SwiftUI app (MVVM, @Observable, async/await)
    HoardApp.swift            @main + SessionStore (token, flushOutbox)
    ContentView.swift         tabs (Library · Inbox · Discover · Notes · Search)
    AuthView.swift            token + Access service pair → Keychain
    LibraryViews.swift        Library + Inbox; Library has collection filters
                              (All · Repos · Tweets · Articles → /api/items?type=…)
    DiscoverView.swift        Discover — Tinyfish daily digest (setup form,
                              running/poll, ready cards: save/read/skip)
    ItemReaderView.swift      Markdown + SFSafariViewController + Copy + reprocess
    NotesViews.swift          Notes list + editor (preview toggle, revisions feed)
    SearchSettingsViews.swift Search (.searchable, debounced, type scopes) +
                              Settings (sign out, tokens, MCP picker, reindex)
    Hoard.entitlements        App Group + Keychain group
  Share/
    ShareViewController.swift accepts URLs/text/PDFs-images (stretch),
                              POST /api/capture, offline → outbox
    Share.entitlements
  project.yml                 XcodeGen project (Hoard + HoardShare targets)
```

Bundle IDs: `com.hoard.app` + `com.hoard.app.share`. App Group: `group.com.hoard.app`.

## Run the backend

```bash
cp .env.example .env
npm install && npm run setup && npm run dev   # http://localhost:3000
# demo: DEV_ACCESS_EMAIL="demo@hoard.local" in .env (no password form)
```

## Open the app

Option A (XcodeGen):

```bash
brew install xcodegen
cd ios && xcodegen generate && open Hoard.xcodeproj
```

Option B: create a blank iOS App project in Xcode, drag in `Hoard/` + `KeepKit/` + `Share/`, set the bundle IDs / groups / `UIAppFonts` as in `project.yml`.

- **API base URL** is per-configuration in `project.yml` via `HOARD_API_BASE_URL`, substituted into `Info.plist`'s `HoardAPIBaseURL`: Debug → `http://localhost:3000`, Release → `https://crawler.sharathchenna.top` (the production Worker). `Config.swift` carries the same values as a compiled fallback. The ATS localhost exception in `project.yml` only affects Debug; Release talks HTTPS.
- Bundle `Inter-Regular.ttf` + `JetBrainsMono-Regular.ttf` in the app target (referenced by `UIAppFonts` / `Font.inter` / `Font.mono`). Fonts are system-fallback-safe if missing.
- Enable **App Groups** (`group.com.hoard.app`) + **Keychain Sharing** on both targets.

## Sign in + test

1. In a browser behind Cloudflare Access, open Settings → Agent tokens → issue a token.
   Create a service-token pair (Zero Trust → Access → Service Tokens) if the API
   sits behind Access. In the app, paste the Hoard token (+ Access ID/secret);
   it verifies with a light read before storing everything in the shared Keychain.
2. Library/Inbox/Discover/Notes/Search mirror `/library`, `/inbox`, `/discover`,
   `/notes`, `/search`. Library's segmented control folds in the web's Repos /
   Tweets / Articles section pages (`/api/items?type=repo|x|page,pdf`). Search's
   scope buttons map to the same server `type` param. ＋ (Library/Inbox toolbar)
   captures a pasted URL or text via `POST /api/capture`.
3. Discover mirrors `/discover`: describe interests + up to 3 seed blogs +
   a 10/20/30-min budget, then Tinyfish returns up to five daily reads to
   save/read/skip. Needs `TINYFISH_API_KEY` on the server.
4. Settings (gear, Library toolbar) → issue token, rebuild the semantic index
   (`POST /api/reindex`), pick an MCP client, copy the same snippet the web builds.

## Test the Share Extension from Safari

1. Run the `Hoard` scheme, then enable the extension (Settings app → General → … or share sheet → More).
2. In Safari open any page → **Share → Hoard** → compact confirmation ("Saved to Hoard ✓").
3. Offline or signed out → it enqueues to the App Group outbox; next app launch flushes it (`SessionStore.flushOutbox()`).

Stretch: widgets showing recent saves, `hoard://` deep links.
