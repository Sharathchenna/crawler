import SwiftUI
import KeepKit

// MARK: - Model

@Observable
@MainActor
final class DiscoverModel {
  var response: DiscoveryResponse?
  var loading = false
  var errorMessage: String?
  var notice: String?
  var starting = false
  var busyArticleID: String?
  var showFinished = false

  // Form fields
  var topics = ""
  var seedsText = ""
  var budget = 20

  var digest: DiscoveryDigest? { response?.digest }
  var configured: Bool { response?.configured ?? true }
  var canStart: Bool { response?.canStart ?? true }

  func load(client: APIClient, prefill: Bool = false) async {
    loading = true; errorMessage = nil
    do {
      let next = try await client.discovery()
      response = next
      if prefill, let prefs = next.preferences, topics.isEmpty {
        topics = prefs.topics
        seedsText = prefs.seeds.joined(separator: "\n")
        budget = prefs.budget
      }
    } catch {
      errorMessage = error.localizedDescription
    }
    loading = false
  }

  func start(client: APIClient) async {
    starting = true; errorMessage = nil; notice = nil
    let seeds = seedsText
      .split(whereSeparator: \.isNewline)
      .map { $0.trimmingCharacters(in: .whitespaces) }
      .filter { !$0.isEmpty }
    do {
      response = try await client.startDiscovery(
        topics: topics.trimmingCharacters(in: .whitespacesAndNewlines),
        seeds: seeds, budget: budget)
    } catch {
      errorMessage = error.localizedDescription
      await load(client: client)
    }
    starting = false
  }

  func act(_ article: DiscoveryArticle, action: String, client: APIClient) async {
    busyArticleID = article.id; errorMessage = nil; notice = nil
    do {
      if action == "save" {
        let item = try await client.capture(url: article.url)
        notice = item.extractionError == nil
          ? "Saved to your library. Open it in the reader whenever you're ready."
          : "Saved as a bookmark; the page couldn't be fully extracted."
        response = try await client.updateDiscoveryArticle(id: article.id, status: "saved")
      } else {
        response = try await client.updateDiscoveryArticle(id: article.id, status: action)
      }
    } catch {
      errorMessage = error.localizedDescription
    }
    busyArticleID = nil
  }
}

// MARK: - View

struct DiscoverView: View {
  @Environment(SessionStore.self) private var session
  @State private var model = DiscoverModel()

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          header
          if let msg = model.errorMessage {
            ErrorBanner(msg) { Task { await model.load(client: session.client) } }
          }
          if let notice = model.notice {
            Text(notice).font(.inter(13)).foregroundStyle(HoardTheme.muted)
          }
          if model.response == nil && model.loading {
            loadingPlaceholder
          }
          if let response = model.response {
            if !response.configured {
              connectTinyfish
            }
            if model.canStart && response.configured {
              setupForm
            }
            if let digest = model.digest {
              if digest.isFailed {
                failureNote(digest)
              }
              if digest.isRunning {
                runningCard(digest)
              }
              if digest.isReady {
                readyEdition(digest)
              }
            }
          }
        }
        .padding()
      }
      .background(HoardTheme.canvas)
      .navigationTitle("Discover")
      .task { await model.load(client: session.client, prefill: true) }
      .refreshable { await model.load(client: session.client) }
      // Poll while a crawl is in flight — there is no live feed.
      .task(id: model.digest?.isRunning == true) {
        guard model.digest?.isRunning == true else { return }
        while !Task.isCancelled {
          try? await Task.sleep(nanoseconds: 35_000_000_000)
          guard !Task.isCancelled else { return }
          await model.load(client: session.client)
          if model.digest?.isRunning != true { return }
        }
      }
    }
  }

  // MARK: Sections

  private var header: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("A LITTLE CURIOSITY. A CLEAR STOPPING POINT.")
        .font(.mono(10)).tracking(1.5).foregroundStyle(HoardTheme.accentHi)
      Text("Discover").font(.title(28)).foregroundStyle(HoardTheme.text)
      Text("Thoughtful blogs, found for you by Tinyfish. Up to five reads a day, within your reading budget. Save what matters, then get on with your day.")
        .font(.inter(14)).foregroundStyle(HoardTheme.muted)
    }
  }

  private var loadingPlaceholder: some View {
    HStack(spacing: 8) {
      ProgressView().tint(HoardTheme.accentHi)
      Text("Loading your daily edition…").font(.mono(12)).foregroundStyle(HoardTheme.faint)
    }
  }

  private var connectTinyfish: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Connect Tinyfish").font(.inter(15, weight: .semibold)).foregroundStyle(HoardTheme.text)
      Text("Add TINYFISH_API_KEY to your server environment and restart the app. For Cloudflare, add it as a Worker secret. Your key stays on the server.")
        .font(.inter(13)).foregroundStyle(HoardTheme.muted)
      Link("Get a Tinyfish API key ↗", destination: URL(string: "https://agent.tinyfish.ai/api-keys")!)
        .font(.inter(13)).tint(HoardTheme.accentHi)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .hoardCard()
  }

  private var setupForm: some View {
    VStack(alignment: .leading, spacing: 14) {
      VStack(alignment: .leading, spacing: 6) {
        Text("What do you want to learn about?").font(.inter(13, weight: .medium)).foregroundStyle(HoardTheme.text)
        TextEditor(text: $model.topics)
          .font(.inter(14)).frame(minHeight: 74).scrollContentBackground(.hidden)
          .padding(8).background(HoardTheme.hover)
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(HoardTheme.border, lineWidth: 1))
        Text("e.g. building AI agents, independent software, thoughtful engineering write-ups")
          .font(.mono(11)).foregroundStyle(HoardTheme.faint)
      }
      VStack(alignment: .leading, spacing: 6) {
        Text("Favourite blogs · optional, up to 3, one URL per line")
          .font(.inter(13, weight: .medium)).foregroundStyle(HoardTheme.text)
        TextEditor(text: $model.seedsText)
          .font(.mono(13)).frame(minHeight: 66).scrollContentBackground(.hidden)
          .textInputAutocapitalization(.never).autocorrectionDisabled()
          .keyboardType(.URL)
          .padding(8).background(HoardTheme.hover)
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(HoardTheme.border, lineWidth: 1))
      }
      HStack(alignment: .bottom) {
        VStack(alignment: .leading, spacing: 6) {
          Text("Daily reading budget").font(.inter(13, weight: .medium)).foregroundStyle(HoardTheme.text)
          Picker("Budget", selection: $model.budget) {
            ForEach([10, 20, 30], id: \.self) { n in Text("\(n) minutes").tag(n) }
          }
          .pickerStyle(.segmented)
        }
      }
      Button {
        Task { await model.start(client: session.client) }
      } label: {
        Text(model.starting ? "Starting…"
             : (model.digest?.isFailed == true ? "Retry today's crawl" : "Find today's reads"))
          .font(.inter(14, weight: .medium))
          .frame(maxWidth: .infinity)
          .padding(.vertical, 10)
          .background(HoardTheme.accent)
          .foregroundStyle(.white)
          .clipShape(RoundedRectangle(cornerRadius: 8))
      }
      .disabled(model.starting || model.topics.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
      Text("One edition per UTC day. Each crawl uses your Tinyfish account credits and runs for up to five minutes. Reading times are estimates.")
        .font(.mono(11)).foregroundStyle(HoardTheme.faint)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .hoardCard()
  }

  private func failureNote(_ digest: DiscoveryDigest) -> some View {
    Text((digest.error ?? "That crawl couldn't finish.") + (digest.attempts >= 2 ? " Today's two attempts are used. A fresh edition is available tomorrow (UTC)." : ""))
      .font(.inter(13)).foregroundStyle(HoardTheme.muted)
  }

  private func runningCard(_ digest: DiscoveryDigest) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        ProgressView().tint(HoardTheme.accentHi)
        Text("Tinyfish is out reading.").font(.inter(16, weight: .medium)).foregroundStyle(HoardTheme.text)
      }
      Text("Finding blogs and checking articles about \(digest.topics). This usually takes a few minutes. You can leave this tab and come back; your crawl will still be here.")
        .font(.inter(13)).foregroundStyle(HoardTheme.muted)
      Button("Check progress") { Task { await model.load(client: session.client) } }
        .font(.mono(12)).buttonStyle(.bordered).tint(HoardTheme.accentHi)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .hoardCard()
  }

  private func readyEdition(_ digest: DiscoveryDigest) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("Your \(digest.day) edition · UTC").font(.inter(13, weight: .medium)).foregroundStyle(HoardTheme.text)
        Spacer()
        Text("\(digest.remaining.count) left · ~\(digest.minutesLeft) min")
          .font(.mono(11)).foregroundStyle(HoardTheme.muted)
      }
      Divider().overlay(HoardTheme.borderSoft)
      Text("\(digest.topics) · \(digest.budget)-minute budget")
        .font(.mono(11)).foregroundStyle(HoardTheme.muted)

      if digest.remaining.isEmpty {
        VStack(alignment: .leading, spacing: 8) {
          Text(digest.articles.isEmpty ? "Nothing worth adding today." : "You're done for today.")
            .font(.inter(18, weight: .medium)).foregroundStyle(HoardTheme.text)
          Text(digest.articles.isEmpty
               ? "No new articles met your filters and reading budget. A short list beats filler. Come back tomorrow for a fresh edition."
               : "Your reading list has an end. Take something you learned and go make something. Come back tomorrow for a fresh edition.")
            .font(.inter(13)).foregroundStyle(HoardTheme.muted)
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).hoardCard()
      }

      ForEach(model.showFinished ? digest.articles : digest.remaining) { article in
        ArticleCard(article: article, model: model)
      }

      if !digest.finished.isEmpty {
        Button(model.showFinished ? "Hide finished articles" : "Show \(digest.finished.count) saved, read or skipped") {
          model.showFinished.toggle()
        }
        .font(.mono(11)).tint(HoardTheme.muted)
      }
      Text("End of edition. No more to load.")
        .font(.mono(10)).foregroundStyle(HoardTheme.faint)
        .frame(maxWidth: .infinity)
    }
  }
}

// MARK: - Article card

private struct ArticleCard: View {
  var article: DiscoveryArticle
  @Bindable var model: DiscoverModel
  @Environment(SessionStore.self) private var session
  @State private var showSafari = false

  private var busy: Bool { model.busyArticleID != nil }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) {
        Text(article.domain).font(.mono(11)).foregroundStyle(HoardTheme.faint)
        Text("· ~\(article.minutes) min").font(.mono(11)).foregroundStyle(HoardTheme.faint)
        if let a = article.author, !a.isEmpty {
          Text("· \(a)").font(.mono(11)).foregroundStyle(HoardTheme.faint).lineLimit(1)
        }
        if article.status != "unread" {
          Text("· \(article.status)").font(.mono(11)).foregroundStyle(HoardTheme.accentHi)
        }
      }
      Button { showSafari = true } label: {
        Text(article.title + " ↗").font(.inter(17, weight: .medium))
          .foregroundStyle(HoardTheme.text).multilineTextAlignment(.leading)
      }
      .buttonStyle(.plain)
      Text(article.summary).font(.inter(14)).foregroundStyle(HoardTheme.textBody)
      (Text("Why this read: ").font(.inter(12, weight: .medium)).foregroundColor(HoardTheme.accentHi)
        + Text(article.reason).font(.inter(12)).foregroundColor(HoardTheme.muted))

      HStack(spacing: 8) {
        if let itemId = article.itemId {
          NavigationLink { ItemReaderView(itemID: itemId) } label: {
            Text("Open reader").font(.mono(12))
          }
          .buttonStyle(.bordered).tint(HoardTheme.accentHi)
        } else {
          Button(model.busyArticleID == article.id ? "Working…" : "Save to library") {
            Task { await model.act(article, action: "save", client: session.client) }
          }
          .font(.mono(12)).buttonStyle(.bordered).tint(HoardTheme.accentHi).disabled(busy)
        }
        if article.status == "unread" {
          Button("Mark read") { Task { await model.act(article, action: "read", client: session.client) } }
            .font(.mono(12)).buttonStyle(.bordered).disabled(busy)
          Button("Skip") { Task { await model.act(article, action: "skipped", client: session.client) } }
            .font(.mono(12)).buttonStyle(.bordered).disabled(busy)
        } else {
          Button("Back to list") { Task { await model.act(article, action: "unread", client: session.client) } }
            .font(.mono(12)).buttonStyle(.bordered).disabled(busy)
        }
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .hoardCard()
    .sheet(isPresented: $showSafari) {
      if let u = URL(string: article.url) { SafariView(url: u) }
    }
  }
}
