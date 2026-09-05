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
    ContentView.swift         tabs + ＋ quick capture
    AuthView.swift            email/password → /api/auth/token → Keychain
    LibraryViews.swift        Library (tab 1) + Inbox (tab 2)
    ItemReaderView.swift      Markdown + SFSafariViewController + Copy
    NotesViews.swift          Notes list + editor (preview toggle, revisions feed)
    SearchSettingsViews.swift Search (.searchable, debounced) + Settings
                              (plan, sign out, tokens + MCP picker)
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
# demo: demo@hoard.local / password
```

## Open the app

Option A (XcodeGen):

```bash
brew install xcodegen
cd ios && xcodegen generate && open Hoard.xcodeproj
```

Option B: create a blank iOS App project in Xcode, drag in `Hoard/` + `KeepKit/` + `Share/`, set the bundle IDs / groups / `UIAppFonts` as in `project.yml`.

- Set **HoardAPIBaseURL** to `http://localhost:3000` for dev (ATS exception for localhost is in `project.yml`; remove for release) or your prod URL.
- Bundle `Inter-Regular.ttf` + `JetBrainsMono-Regular.ttf` in the app target (referenced by `UIAppFonts` / `Font.inter` / `Font.mono`). Fonts are system-fallback-safe if missing.
- Enable **App Groups** (`group.com.hoard.app`) + **Keychain Sharing** on both targets.

## Sign in + test

1. Run on simulator/device, sign in with `demo@hoard.local` / `password` (calls `POST /api/auth/token`, stores bearer in shared Keychain).
2. Library/Inbox/Notes/Search mirror `/library`, `/inbox`, `/notes`, `/search`. ＋ captures a pasted URL via `POST /api/capture`.
3. Settings → issue token, pick an MCP client, copy the same snippet the web builds.

## Test the Share Extension from Safari

1. Run the `Hoard` scheme, then enable the extension (Settings app → General → … or share sheet → More).
2. In Safari open any page → **Share → Hoard** → compact confirmation ("Saved to Hoard ✓").
3. Offline or signed out → it enqueues to the App Group outbox; next app launch flushes it (`SessionStore.flushOutbox()`).

Stretch: widgets showing recent saves, `hoard://` deep links.
