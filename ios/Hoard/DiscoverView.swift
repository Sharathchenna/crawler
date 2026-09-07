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
  var savingSchedule = false
  var busyArticleID: String?
  var showFinished = false
  var showSchedule = false
  var selectedEdition: DiscoveryEdition?   // nil = latest

  // Manual crawl form
  var topics = ""
  var seedsText = ""
  var budget = 20

  // Schedule form
  var dailyEnabled = true
  var dailyTopics = DiscoverySources.defaultTopics
  var dailyBudget = 30
  var sourceIds: Set<String> = Set(DiscoverySources.allIds)
  private var prefilled = false

  var digest: DiscoveryDigest? { response?.digest }
  var configured: Bool { response?.configured ?? true }
  var editions: [DiscoveryEdition] { response?.editionList ?? [] }
  var schedule: DiscoverySchedule? { response?.schedule }
  var scheduleEnabled: Bool { schedule?.enabled ?? false }

  var viewingLatest: Bool {
    guard let sel = selectedEdition, let latest = editions.first else { return true }
    return sel.id == latest.id
  }
  var canStart: Bool {
    guard viewingLatest, !scheduleEnabled else { return false }
    guard let digest else { return true }
    return digest.canRetry
  }

  func load(client: APIClient, prefill: Bool = false) async {
    loading = true; errorMessage = nil
    do {
      let next = try await client.discovery(day: selectedEdition?.day, slot: selectedEdition?.slot)
      response = next
      if prefill && !prefilled {
        if let prefs = next.preferences {
          topics = prefs.topics; seedsText = prefs.seeds.joined(separator: "\n"); budget = prefs.budget
        }
        if let sch = next.schedule {
          dailyEnabled = sch.enabled; dailyTopics = sch.topics
          dailyBudget = sch.budget; sourceIds = Set(sch.sourceIds)
        }
        prefilled = true
      }
    } catch {
      errorMessage = error.localizedDescription
    }
    loading = false
  }

  func selectEdition(_ edition: DiscoveryEdition?, client: APIClient) {
    selectedEdition = edition
    showFinished = false
    Task { await load(client: client) }
  }

  func start(client: APIClient) async {
    starting = true; errorMessage = nil; notice = nil
    let seeds = seedsText.split(whereSeparator: \.isNewline)
      .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    do {
      selectedEdition = nil
      response = try await client.startDiscovery(
        topics: topics.trimmingCharacters(in: .whitespacesAndNewlines), seeds: seeds, budget: budget)
    } catch {
      errorMessage = error.localizedDescription
      await load(client: client)
    }
    starting = false
  }

  func saveSchedule(client: APIClient) async {
    savingSchedule = true; errorMessage = nil; notice = nil
    do {
      response = try await client.saveDiscoverySchedule(
        enabled: dailyEnabled,
        topics: dailyTopics.trimmingCharacters(in: .whitespacesAndNewlines),
        budget: dailyBudget,
        sourceIds: Array(sourceIds))
      notice = dailyEnabled
        ? "Discovery is enabled. A fresh edition lands every 3 hours, automatically."
        : "Scheduled editions are paused."
    } catch {
      errorMessage = error.localizedDescription
    }
    savingSchedule = false
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
          editionPicker
          if let msg = model.errorMessage {
            ErrorBanner(msg) { Task { await model.load(client: session.client) } }
          }
          if let notice = model.notice {
            Text(notice).font(.inter(13)).foregroundStyle(HoardTheme.muted)
          }
          if model.response == nil && model.loading { loadingPlaceholder }

          if let response = model.response {
            scheduleCard
            if !response.configured { connectTinyfish }
            if model.canStart && response.configured && !model.scheduleEnabled { setupForm }
            if let digest = model.digest {
              if digest.isFailed { failureNote(digest) }
              if digest.isRunning { runningCard(digest) }
              if digest.isReady { readyEdition(digest) }
            } else if model.scheduleEnabled {
              Text("This slot's edition hasn't started yet. The scheduler checks every few minutes; you don't need to keep this open.")
                .font(.inter(13)).foregroundStyle(HoardTheme.muted)
            }
          }
        }
        .padding()
      }
      .background(HoardTheme.canvas)
      .navigationTitle("Discover")
      .task { await model.load(client: session.client, prefill: true) }
      .refreshable { await model.load(client: session.client) }
      // Poll while a crawl runs (35s) or the schedule is on (5 min).
      .task(id: pollKey) {
        let running = model.digest?.isRunning == true
        guard running || model.scheduleEnabled else { return }
        while !Task.isCancelled {
          try? await Task.sleep(nanoseconds: UInt64(running ? 35 : 300) * 1_000_000_000)
          guard !Task.isCancelled else { return }
          await model.load(client: session.client)
          if model.digest?.isRunning != true && !model.scheduleEnabled { return }
        }
      }
    }
  }

  private var pollKey: String {
    "\(model.digest?.isRunning == true)-\(model.scheduleEnabled)-\(model.selectedEdition?.id ?? "latest")"
  }

  // MARK: Sections

  private var header: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("A LITTLE CURIOSITY. A CLEAR STOPPING POINT.")
        .font(.mono(10)).tracking(1.5).foregroundStyle(HoardTheme.accentHi)
      Text("Discover").font(.title(28)).foregroundStyle(HoardTheme.text)
      Text("Hacker News, independent blogs and tech newsletters, collected every three hours. Tinyfish reads a shortlist for you — up to five reads per edition.")
        .font(.inter(14)).foregroundStyle(HoardTheme.muted)
    }
  }

  @ViewBuilder private var editionPicker: some View {
    if !model.editions.isEmpty {
      Menu {
        Button("Latest") { model.selectEdition(nil, client: session.client) }
        ForEach(model.editions) { e in
          Button("\(e.label) · \(e.status)") { model.selectEdition(e, client: session.client) }
        }
      } label: {
        HStack(spacing: 6) {
          Image(systemName: "calendar")
          Text(model.viewingLatest ? "Latest edition" : (model.selectedEdition?.label ?? "Edition"))
            .font(.inter(13, weight: .medium))
          Image(systemName: "chevron.down").font(.system(size: 10))
        }
        .foregroundStyle(HoardTheme.textBody)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(HoardTheme.hover)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(HoardTheme.border, lineWidth: 1))
      }
    }
  }

  private var loadingPlaceholder: some View {
    HStack(spacing: 8) {
      ProgressView().tint(HoardTheme.accentHi)
      Text("Loading your latest edition…").font(.mono(12)).foregroundStyle(HoardTheme.faint)
    }
  }

  private var scheduleCard: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text(model.scheduleEnabled ? "Scheduled discovery is on" : "Automatic discovery every 3 hours")
          .font(.inter(15, weight: .medium)).foregroundStyle(HoardTheme.text)
        Spacer()
      }
      Text("00 · 03 · 06 · 09 · 12 · 15 · 18 · 21 UTC")
        .font(.mono(10)).foregroundStyle(HoardTheme.faint)
      Text(model.scheduleEnabled
           ? "Your sources are checked automatically, even when the app is closed. Each edition is usually ready ~15 minutes after its slot starts."
           : "Enable once to get a fresh edition every 3 hours, without starting a crawl yourself.")
        .font(.inter(13)).foregroundStyle(HoardTheme.muted)
      if let sch = model.schedule, sch.enabled, let last = sch.lastRunAt {
        Text("Last checked: \(last)").font(.mono(10)).foregroundStyle(HoardTheme.faint)
      }
      if let err = model.schedule?.lastError, !err.isEmpty {
        Text(err).font(.mono(10)).foregroundStyle(HoardTheme.amber)
      }
      Button {
        withAnimation { model.showSchedule.toggle() }
      } label: {
        Text(model.showSchedule ? "Hide sources & schedule" : "Sources and schedule preferences")
          .font(.inter(13)).foregroundStyle(HoardTheme.accentHi)
      }
      .buttonStyle(.plain)
      if model.showSchedule { scheduleForm }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .hoardCard()
  }

  private var scheduleForm: some View {
    VStack(alignment: .leading, spacing: 12) {
      Toggle(isOn: $model.dailyEnabled) {
        Text("Automatically prepare an edition every 3 hours").font(.inter(13)).foregroundStyle(HoardTheme.textBody)
      }
      .tint(HoardTheme.accent)
      VStack(alignment: .leading, spacing: 4) {
        Text("Interests").font(.inter(12, weight: .medium)).foregroundStyle(HoardTheme.muted)
        TextEditor(text: $model.dailyTopics)
          .font(.inter(13)).frame(minHeight: 60).scrollContentBackground(.hidden)
          .padding(8).background(HoardTheme.hover)
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(HoardTheme.border, lineWidth: 1))
      }
      VStack(alignment: .leading, spacing: 4) {
        Text("Reading budget").font(.inter(12, weight: .medium)).foregroundStyle(HoardTheme.muted)
        Picker("Budget", selection: $model.dailyBudget) {
          ForEach([10, 20, 30], id: \.self) { Text("\($0) minutes").tag($0) }
        }.pickerStyle(.segmented)
      }
      Text("Your source collection").font(.inter(12, weight: .medium)).foregroundStyle(HoardTheme.muted)
      ForEach(DiscoverySources.all) { source in
        sourceRow(source)
      }
      Button {
        Task { await model.saveSchedule(client: session.client) }
      } label: {
        Text(model.savingSchedule ? "Saving…" : "Save preferences")
          .font(.inter(13, weight: .medium)).frame(maxWidth: .infinity).padding(.vertical, 9)
          .background(HoardTheme.accent).foregroundStyle(.white)
          .clipShape(RoundedRectangle(cornerRadius: 8))
      }
      .disabled(model.savingSchedule || model.sourceIds.isEmpty)
    }
    .padding(.top, 4)
  }

  private func sourceRow(_ source: DiscoverySources.Source) -> some View {
    let on = model.sourceIds.contains(source.id)
    let health = model.schedule?.sourceHealth?.first { $0.id == source.id }
    return Button {
      if on { model.sourceIds.remove(source.id) } else { model.sourceIds.insert(source.id) }
    } label: {
      HStack(alignment: .top, spacing: 10) {
        Image(systemName: on ? "checkmark.square.fill" : "square")
          .foregroundStyle(on ? HoardTheme.accentHi : HoardTheme.faint)
          .font(.system(size: 16))
        VStack(alignment: .leading, spacing: 2) {
          Text(source.name).font(.inter(13, weight: .medium)).foregroundStyle(HoardTheme.text)
          Text(source.description).font(.inter(12)).foregroundStyle(HoardTheme.muted)
            .fixedSize(horizontal: false, vertical: true)
          if let h = health {
            Text(h.error?.isEmpty == false ? "Last check: \(h.error!)" : "\(h.count) recent links on last check")
              .font(.mono(10)).foregroundStyle(HoardTheme.faint)
          }
        }
        Spacer()
      }
    }
    .buttonStyle(.plain)
  }

  private var connectTinyfish: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Connect Tinyfish").font(.inter(15, weight: .semibold)).foregroundStyle(HoardTheme.text)
      Text("Add TINYFISH_API_KEY to your server environment and restart the app. For Cloudflare, add it as a Worker secret.")
        .font(.inter(13)).foregroundStyle(HoardTheme.muted)
      Link("Get a Tinyfish API key ↗", destination: URL(string: "https://agent.tinyfish.ai/api-keys")!)
        .font(.inter(13)).tint(HoardTheme.accentHi)
    }
    .padding(16).frame(maxWidth: .infinity, alignment: .leading).hoardCard()
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
      }
      VStack(alignment: .leading, spacing: 6) {
        Text("Favourite blogs · optional, up to 3, one URL per line")
          .font(.inter(13, weight: .medium)).foregroundStyle(HoardTheme.text)
        TextEditor(text: $model.seedsText)
          .font(.mono(13)).frame(minHeight: 66).scrollContentBackground(.hidden)
          .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
          .padding(8).background(HoardTheme.hover)
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(HoardTheme.border, lineWidth: 1))
      }
      VStack(alignment: .leading, spacing: 6) {
        Text("Reading budget").font(.inter(13, weight: .medium)).foregroundStyle(HoardTheme.text)
        Picker("Budget", selection: $model.budget) {
          ForEach([10, 20, 30], id: \.self) { Text("\($0) minutes").tag($0) }
        }.pickerStyle(.segmented)
      }
      Button {
        Task { await model.start(client: session.client) }
      } label: {
        Text(model.starting ? "Starting…" : (model.digest?.isFailed == true ? "Retry this edition" : "Find today's reads"))
          .font(.inter(14, weight: .medium)).frame(maxWidth: .infinity).padding(.vertical, 10)
          .background(HoardTheme.accent).foregroundStyle(.white)
          .clipShape(RoundedRectangle(cornerRadius: 8))
      }
      .disabled(model.starting || model.topics.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
      Text("One edition per 3-hour slot. Each crawl uses your Tinyfish credits and runs up to five minutes.")
        .font(.mono(11)).foregroundStyle(HoardTheme.faint)
    }
    .padding(16).frame(maxWidth: .infinity, alignment: .leading).hoardCard()
  }

  private func failureNote(_ digest: DiscoveryDigest) -> some View {
    Text((digest.error ?? "That crawl couldn't finish.") + (digest.attempts >= 2 ? " This edition's two attempts are used. The next slot starts fresh." : ""))
      .font(.inter(13)).foregroundStyle(HoardTheme.muted)
  }

  private func runningCard(_ digest: DiscoveryDigest) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        ProgressView().tint(HoardTheme.accentHi)
        Text("Tinyfish is out reading.").font(.inter(16, weight: .medium)).foregroundStyle(HoardTheme.text)
      }
      Text("Finding blogs and checking articles about \(digest.topics). This usually takes a few minutes.")
        .font(.inter(13)).foregroundStyle(HoardTheme.muted)
      Button("Check progress") { Task { await model.load(client: session.client) } }
        .font(.mono(12)).buttonStyle(.bordered).tint(HoardTheme.accentHi)
    }
    .padding(16).frame(maxWidth: .infinity, alignment: .leading).hoardCard()
  }

  private func readyEdition(_ digest: DiscoveryDigest) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("Your \(digest.editionLabel) edition").font(.inter(13, weight: .medium)).foregroundStyle(HoardTheme.text)
        Spacer()
        Text("\(digest.remaining.count) left · ~\(digest.minutesLeft) min")
          .font(.mono(11)).foregroundStyle(HoardTheme.muted)
      }
      Divider().overlay(HoardTheme.borderSoft)
      Text("\(digest.topics) · \(digest.budget)-minute budget")
        .font(.mono(11)).foregroundStyle(HoardTheme.muted)

      if digest.remaining.isEmpty {
        VStack(alignment: .leading, spacing: 8) {
          Text(digest.articles.isEmpty ? "Nothing worth adding this time." : "You're done with this edition.")
            .font(.inter(18, weight: .medium)).foregroundStyle(HoardTheme.text)
          Text(digest.articles.isEmpty
               ? "No new articles met your filters and reading budget. The next edition lands on the next slot."
               : "Your reading list has an end. Take something you learned and go make something. The next edition lands on the next slot.")
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
        .font(.mono(10)).foregroundStyle(HoardTheme.faint).frame(maxWidth: .infinity)
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
      HStack(alignment: .top, spacing: 12) {
        ArticleThumb(article: article, client: session.client)
        VStack(alignment: .leading, spacing: 8) {
          Text(article.summary).font(.inter(14)).foregroundStyle(HoardTheme.textBody)
          (Text("Why this read: ").font(.inter(12, weight: .medium)).foregroundColor(HoardTheme.accentHi)
            + Text(article.reason).font(.inter(12)).foregroundColor(HoardTheme.muted))
        }
      }
      HStack(spacing: 8) {
        if let itemId = article.itemId {
          NavigationLink { ItemReaderView(itemID: itemId) } label: { Text("Open reader").font(.mono(12)) }
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
    .padding(16).frame(maxWidth: .infinity, alignment: .leading).hoardCard()
    .sheet(isPresented: $showSafari) {
      if let u = URL(string: article.url) { SafariView(url: u) }
    }
  }
}

/// Lead-image thumbnail. Uses the stored imageUrl; if absent, asks
/// /api/discover/og once, then falls back to a domain-initial badge.
private struct ArticleThumb: View {
  var article: DiscoveryArticle
  var client: APIClient
  @State private var resolved: String?

  private var src: String { article.image.isEmpty ? (resolved ?? "") : article.image }

  var body: some View {
    Group {
      if let url = URL(string: src), !src.isEmpty {
        AsyncImage(url: url) { phase in
          switch phase {
          case .success(let image): image.resizable().aspectRatio(contentMode: .fill)
          default: placeholder
          }
        }
      } else {
        placeholder
      }
    }
    .frame(width: 96, height: 68)
    .clipShape(RoundedRectangle(cornerRadius: 8))
    .overlay(RoundedRectangle(cornerRadius: 8).stroke(HoardTheme.borderSoft, lineWidth: 1))
    .task(id: article.id) {
      guard article.image.isEmpty, resolved == nil else { return }
      resolved = try? await client.discoverOgImage(url: article.url)
    }
  }

  private var placeholder: some View {
    ZStack {
      HoardTheme.hover
      Text(String(article.domain.first ?? "?").uppercased())
        .font(.mono(18)).foregroundStyle(HoardTheme.faint)
    }
  }
}
