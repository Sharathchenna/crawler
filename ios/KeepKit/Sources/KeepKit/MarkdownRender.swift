import SwiftUI
import Markdown

/// Native Markdown renderer matching the web reader (reader-body CSS).
/// Block layout is real SwiftUI (headings, quotes, lists, tables, code
/// cards, images); inline styling is one AttributedString per block so
/// links stay tappable and bold/italic/code render inline.
public struct HoardMarkdown: View {
  public var source: String
  public init(source: String) { self.source = source }

  public var body: some View {
    let blocks = Array(Document(parsing: source).blockChildren)
    VStack(alignment: .leading, spacing: 12) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
        HoardBlockView(block: block)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

// MARK: - Blocks

struct HoardBlockView: View {
  var block: BlockMarkup

  var body: some View {
    Group {
      switch block {
      case let h as Heading:
        heading(h)
      case let p as Paragraph:
        paragraph(p)
      case let q as BlockQuote:
        quote(q)
      case let c as CodeBlock:
        HoardCodeBlock(code: c.code, language: c.language)
      case is ThematicBreak:
        Divider().overlay(HoardTheme.borderSoft)
      case let u as UnorderedList:
        listItems(Array(u.listItems), ordered: false, start: 0)
      case let o as OrderedList:
        listItems(Array(o.listItems), ordered: true, start: o.startIndex)
      case let t as Markdown.Table:
        HoardTable(table: t)
      case let h as HTMLBlock:
        htmlFallback(h.rawHTML)
      default:
        EmptyView()
      }
    }
  }

  private func listItems(_ items: [ListItem], ordered: Bool, start: UInt) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      ForEach(Array(items.enumerated()), id: \.offset) { idx, item in
        HoardListItem(
          item: item,
          marker: ordered ? "\(start + UInt(idx))." : "•",
          ordered: ordered
        )
      }
    }
  }

  private func heading(_ h: Heading) -> some View {
    let size: CGFloat
    switch min(max(h.level, 1), 4) {
    case 1: size = 24
    case 2: size = 20
    case 3: size = 16
    default: size = 14
    }
    return Text(InlineBuilder.attributed(for: h, size: size, weight: .semibold))
      .font(.title(size))
      .foregroundStyle(HoardTheme.text)
      .tracking(-size * 0.02)
      .textSelection(.enabled)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.top, h.level <= 2 ? 6 : 2)
  }

  @ViewBuilder
  private func paragraph(_ p: Paragraph) -> some View {
    // A lone image becomes a real image view.
    let inlines = Array(p.inlineChildren)
    if inlines.count == 1, let img = inlines.first as? Markdown.Image {
      HoardImage(source: img.source, caption: img.title)
    } else {
      Text(InlineBuilder.attributed(for: p))
        .font(.inter(15))
        .foregroundStyle(HoardTheme.textBody)
        .lineSpacing(5)
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func quote(_ q: BlockQuote) -> some View {
    HStack(alignment: .top, spacing: 10) {
      RoundedRectangle(cornerRadius: 1)
        .fill(HoardTheme.accent)
        .frame(width: 2)
      VStack(alignment: .leading, spacing: 8) {
        ForEach(Array(Array(q.blockChildren).enumerated()), id: \.offset) { _, child in
          HoardBlockView(block: child)
        }
      }
    }
    .padding(.vertical, 2)
  }

  @ViewBuilder
  private func htmlFallback(_ raw: String) -> some View {
    let stripped = raw
      .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if !stripped.isEmpty {
      Text(stripped)
        .font(.inter(14))
        .foregroundStyle(HoardTheme.muted)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

// MARK: - List items

struct HoardListItem: View {
  var item: ListItem
  var marker: String
  var ordered: Bool

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      if let box = item.checkbox {
        Image(systemName: box == .checked ? "checkmark.square.fill" : "square")
          .foregroundStyle(box == .checked ? HoardTheme.green : HoardTheme.faint)
          .font(.system(size: 14))
          .padding(.top, 2)
      } else {
        Text(marker)
          .font(ordered ? .mono(13) : .system(size: 14))
          .foregroundStyle(HoardTheme.faint)
          .frame(minWidth: ordered ? 22 : 12, alignment: .trailing)
          .padding(.top, 1)
      }
      VStack(alignment: .leading, spacing: 6) {
        ForEach(Array(Array(item.blockChildren).enumerated()), id: \.offset) { _, child in
          HoardBlockView(block: child)
        }
      }
    }
  }
}

// MARK: - Tables

struct HoardTable: View {
  var table: Markdown.Table

  var body: some View {
    let headCells = Array(table.head.cells)
    let rows = Array(table.body.rows)
    return ScrollView(.horizontal, showsIndicators: false) {
      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .top, spacing: 0) {
          ForEach(Array(headCells.enumerated()), id: \.offset) { _, cell in
            Text(InlineBuilder.attributed(for: cell, size: 13, weight: .semibold))
              .font(.inter(13, weight: .semibold))
              .foregroundStyle(HoardTheme.text)
              .padding(.horizontal, 10).padding(.vertical, 7)
              .frame(minWidth: 90, alignment: .leading)
          }
        }
        .background(HoardTheme.raised)
        Divider().overlay(HoardTheme.borderSoft)
        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
          HStack(alignment: .top, spacing: 0) {
            ForEach(Array(Array(row.cells).enumerated()), id: \.offset) { _, cell in
              Text(InlineBuilder.attributed(for: cell, size: 13))
                .font(.inter(13))
                .foregroundStyle(HoardTheme.textBody)
                .padding(.horizontal, 10).padding(.vertical, 7)
                .frame(minWidth: 90, alignment: .leading)
            }
          }
          Divider().overlay(HoardTheme.borderSoft)
        }
      }
    }
    .overlay(RoundedRectangle(cornerRadius: HoardTheme.radiusCard).stroke(HoardTheme.borderSoft, lineWidth: 1))
    .clipShape(RoundedRectangle(cornerRadius: HoardTheme.radiusCard))
  }
}

// MARK: - Code blocks

struct HoardCodeBlock: View {
  var code: String
  var language: String?
  @State private var copied = false

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 8) {
        Text((language?.isEmpty == false ? language! : "code").uppercased())
          .font(.mono(10)).foregroundStyle(HoardTheme.faint)
        Spacer()
        Button(copied ? "Copied" : "Copy") {
          UIPasteboard.general.string = code
          copied = true
          DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copied = false }
        }
        .font(.mono(10))
        .foregroundStyle(HoardTheme.muted)
      }
      .padding(.horizontal, 12).padding(.vertical, 7)
      Divider().overlay(HoardTheme.borderSoft)
      ScrollView(.horizontal, showsIndicators: false) {
        Text(CodeHighlighter.highlight(code: code))
          .font(.custom("JetBrainsMono-Regular", size: 12.5))
          .lineSpacing(4)
          .textSelection(.enabled)
          .padding(12)
      }
    }
    .background(HoardTheme.raised)
    .overlay(RoundedRectangle(cornerRadius: HoardTheme.radiusCard).stroke(HoardTheme.borderSoft, lineWidth: 1))
    .clipShape(RoundedRectangle(cornerRadius: HoardTheme.radiusCard))
    .shadow(color: .white.opacity(0.03), radius: 0, x: 0, y: 1)
  }
}

// MARK: - Images

struct HoardImage: View {
  var source: String?
  var caption: String?

  var body: some View {
    Group {
      if let source, let url = URL(string: source),
         let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme) {
        VStack(alignment: .leading, spacing: 6) {
          AsyncImage(url: url) { phase in
            switch phase {
            case .empty:
              ZStack {
                RoundedRectangle(cornerRadius: HoardTheme.radiusCard).fill(HoardTheme.hover)
                ProgressView().tint(HoardTheme.accentHi)
              }
              .frame(height: 180)
            case .success(let image):
              image.resizable().scaledToFit()
            case .failure:
              Link(destination: url) {
                HStack(spacing: 6) {
                  Image(systemName: "photo")
                  Text(source).font(.mono(12)).lineLimit(1)
                }
                .foregroundStyle(HoardTheme.muted)
                .padding(12)
                .background(HoardTheme.hover)
                .clipShape(RoundedRectangle(cornerRadius: 8))
              }
            @unknown default:
              EmptyView()
            }
          }
          .clipShape(RoundedRectangle(cornerRadius: HoardTheme.radiusCard))
          .overlay(RoundedRectangle(cornerRadius: HoardTheme.radiusCard).stroke(HoardTheme.borderSoft, lineWidth: 1))
          if let caption, !caption.isEmpty {
            Text(caption).font(.mono(11)).foregroundStyle(HoardTheme.faint)
          }
        }
      } else if let source {
        Text(source).font(.mono(12)).foregroundStyle(HoardTheme.muted)
      }
    }
  }
}

// MARK: - Inline → AttributedString

enum InlineBuilder {
  static func attributed(for container: Markup, size: CGFloat = 15, weight: UIFont.Weight = .regular) -> AttributedString {
    var walker = Walker(size: size, weight: weight)
    walker.walk(container, bold: false, italic: false, strike: false, code: false, link: nil)
    return walker.result
  }

  struct Walker {
    var size: CGFloat
    var weight: UIFont.Weight
    var result = AttributedString()

    mutating func walk(_ node: Markup, bold: Bool, italic: Bool, strike: Bool, code: Bool, link: URL?) {
      switch node {
      case let t as Markdown.Text:
        append(t.string, bold: bold, italic: italic, strike: strike, code: code, link: link)
      case is Emphasis:
        for child in node.children { walk(child, bold: bold, italic: true, strike: strike, code: code, link: link) }
      case is Strong:
        for child in node.children { walk(child, bold: true, italic: italic, strike: strike, code: code, link: link) }
      case is Strikethrough:
        for child in node.children { walk(child, bold: bold, italic: italic, strike: true, code: code, link: link) }
      case let c as InlineCode:
        append(c.code, bold: bold, italic: italic, strike: strike, code: true, link: link)
      case let l as Markdown.Link:
        let url = l.destination.flatMap(URL.init(string:))
        for child in l.children { walk(child, bold: bold, italic: italic, strike: strike, code: code, link: url ?? link) }
      case let img as Markdown.Image:
        // Inline image: show alt text, linked to the source when possible.
        let url = img.source.flatMap(URL.init(string:)) ?? link
        let kids = Array(img.children)
        if kids.isEmpty {
          append(img.title ?? "image", bold: bold, italic: italic, strike: strike, code: code, link: url)
        } else {
          for child in kids { walk(child, bold: bold, italic: italic, strike: strike, code: code, link: url) }
        }
      case is SoftBreak:
        append(" ", bold: bold, italic: italic, strike: strike, code: code, link: link)
      case is LineBreak:
        append("\n", bold: bold, italic: italic, strike: strike, code: code, link: link)
      case let h as InlineHTML:
        append(h.rawHTML, bold: bold, italic: italic, strike: strike, code: code, link: link)
      case let s as SymbolLink:
        append(s.destination ?? "", bold: bold, italic: italic, strike: strike, code: true, link: link)
      default:
        for child in node.children { walk(child, bold: bold, italic: italic, strike: strike, code: code, link: link) }
      }
    }

    mutating func append(_ s: String, bold: Bool, italic: Bool, strike: Bool, code: Bool, link: URL?) {
      var container = AttributeContainer()
      if bold || italic {
        var traits: UIFontDescriptor.SymbolicTraits = []
        if bold { traits.insert(.traitBold) }
        if italic { traits.insert(.traitItalic) }
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        if let desc = base.fontDescriptor.withSymbolicTraits(traits) {
          container.font = UIFont(descriptor: desc, size: size)
        } else {
          container.font = base
        }
      }
      if strike { container.strikethroughStyle = .single }
      if code {
        container.font = UIFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        container.backgroundColor = UIColor(HoardTheme.hover)
        container.foregroundColor = UIColor(HoardTheme.textBody)
      }
      if let link { container.link = link }
      result += AttributedString(s, attributes: container)
    }
  }
}

// MARK: - Tiny code highlighter (comments / strings / keywords / numbers)

enum CodeHighlighter {
  static func highlight(code: String) -> AttributedString {
    var out = AttributedString(code)
    out.font = UIFont.monospacedSystemFont(ofSize: 12.5, weight: .regular)
    out.foregroundColor = UIColor(HoardTheme.textBody)
    let ns = code as NSString
    let full = NSRange(location: 0, length: ns.length)
    var painted: [NSRange] = []
    func paint(_ pattern: String, color: UIColor, options: NSRegularExpression.Options = []) {
      guard let re = try? NSRegularExpression(pattern: pattern, options: options) else { return }
      for match in re.matches(in: code, options: [], range: full) {
        let r = match.range
        guard r.length > 0 else { continue }
        // Skip overlaps (first match wins: comments > strings > keywords > numbers).
        var overlaps = false
        for p in painted where NSIntersectionRange(p, r).length > 0 { overlaps = true; break }
        if overlaps { continue }
        painted.append(r)
        if let range = Range(r, in: out) {
          out[range].foregroundColor = color
        }
      }
    }
    paint(#"//.*|#[^\n]*|/\*[\s\S]*?\*/|<!--[\s\S]*?-->"#, color: UIColor(HoardTheme.faint))
    paint(#""(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`]*`"#, color: UIColor(HoardTheme.green))
    paint(#"\b(func|return|let|var|if|else|elif|for|while|in|of|import|from|export|default|struct|class|enum|protocol|extension|switch|case|break|continue|do|try|catch|throw|throws|await|async|new|this|self|Self|nil|null|true|false|True|False|None|def|lambda|with|as|pass|raise|const|function|type|interface|package|go|public|private|protected|static|final|override|mut|match|use|mod|fn|impl|where|select|insert|update|delete|create|table)\b"#, color: UIColor(HoardTheme.accentHi))
    paint(#"\b\d[\d_]*(?:\.\d+)?\b"#, color: UIColor(HoardTheme.amber))
    return out
  }
}
