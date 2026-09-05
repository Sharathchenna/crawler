import SwiftUI

/// Design tokens mirroring the web product exactly (Linear aesthetic, dark-first).
public enum HoardTheme {
  // Canvas / surfaces (dark canonical #080808 family)
  public static let canvas = Color(hex: "08090A")
  public static let raised = Color(hex: "0F1011")
  public static let hover = Color(hex: "16171A")
  public static let active = Color(hex: "1C1D21")
  public static let border = Color(hex: "23252A")
  public static let borderSoft = Color(hex: "191B1F")

  // Light theme (secondary)
  public static let canvasLight = Color(hex: "FFFFFF")
  public static let raisedLight = Color(hex: "FBFBFB")
  public static let borderLight = Color(hex: "E6E8EB")

  // Text
  public static let text = Color(hex: "F7F8F8")
  public static let textBody = Color(hex: "D0D2D6")
  public static let muted = Color(hex: "8A8F98")
  public static let faint = Color(hex: "62666D")
  public static let textLight = Color(hex: "0D0E10")
  public static let textBodyLight = Color(hex: "41454C")
  public static let mutedLight = Color(hex: "6B7079")

  // Accent — the one bright thing (indigo)
  public static let accent = Color(hex: "5E6AD2")
  public static let accentHi = Color(hex: "7C89F5")
  public static let accentGlow = Color(hex: "5E6AD2").opacity(0.35)

  // Status — muted, never loud
  public static let green = Color(hex: "4CB782")
  public static let amber = Color(hex: "F2C94C")
  public static let red = Color(hex: "EB5757")

  // Back-compat aliases
  public static let backgroundDark = canvas
  public static let backgroundLight = canvasLight
  public static let textPrimaryDark = text
  public static let textPrimaryLight = textLight
  public static let bodyDark = textBody
  public static let bodyLight = textBodyLight
  public static let hairlineDark = border
  public static let hairlineLight = borderLight

  // Radius: 6 controls / 10 cards / 8 menus
  public static let radiusControl: CGFloat = 6
  public static let radiusCard: CGFloat = 10
  public static let radiusMenu: CGFloat = 8

  public static func statusColor(_ status: String) -> Color {
    switch status {
    case "inbox": return amber
    case "saved": return accentHi
    case "done": return green
    case "archived": return faint
    default: return muted
    }
  }
}

public extension Color {
  public init(hex: String) {
    var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if h.hasPrefix("#") { h.removeFirst() }
    var rgb: UInt64 = 0
    Scanner(string: h).scanHexInt64(&rgb)
    let r = Double((rgb >> 16) & 0xFF) / 255
    let g = Double((rgb >> 8) & 0xFF) / 255
    let b = Double(rgb & 0xFF) / 255
    self.init(red: r, green: g, blue: b)
  }
}

public extension Font {
  /// Inter for UI at the web scale (12/13/14/16/20/24). Titles use tight tracking.
  public static func inter(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    .custom("Inter", size: size).weight(weight)
  }
  /// JetBrains Mono for code, CLI blocks, tokens, timestamps, metadata labels.
  public static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    .custom("JetBrainsMono-Regular", size: size).weight(weight)
  }
  /// Tight title treatment: one weight, one color, -0.02em tracking.
  public static func title(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
    .system(size: size, weight: weight == .semibold ? .semibold : .regular, design: .default)
  }
}

// MARK: - Shared SwiftUI chrome

public struct HoardCard: ViewModifier {
  public init() {}
  public func body(content: Content) -> some View {
    content
      .background(HoardTheme.raised)
      .overlay(RoundedRectangle(cornerRadius: HoardTheme.radiusCard).stroke(HoardTheme.borderSoft, lineWidth: 1))
      .clipShape(RoundedRectangle(cornerRadius: HoardTheme.radiusCard))
      .shadow(color: .white.opacity(0.03), radius: 0, x: 0, y: 1)
  }
}

public extension View {
  func hoardCard() -> some View { modifier(HoardCard()) }
}

public struct StatusPill: View {
  public var status: String
  public init(_ status: String) { self.status = status }
  public var body: some View {
    Text(status)
      .font(.mono(10))
      .foregroundStyle(HoardTheme.statusColor(status))
      .padding(.horizontal, 7)
      .padding(.vertical, 3)
      .background(HoardTheme.statusColor(status).opacity(0.12))
      .clipShape(Capsule())
  }
}

public struct MetaLine: View {
  public var text: String
  public init(_ text: String) { self.text = text }
  public var body: some View {
    Text(text).font(.mono(11)).foregroundStyle(HoardTheme.faint)
  }
}

public struct ErrorBanner: View {
  public var message: String
  public var onRetry: (() -> Void)?
  public init(_ message: String, onRetry: (() -> Void)? = nil) {
    self.message = message; self.onRetry = onRetry
  }
  public var body: some View {
    HStack(alignment: .top, spacing: 8) {
      Image(systemName: "exclamationmark.triangle").foregroundStyle(HoardTheme.amber)
      Text(message).font(.inter(13)).foregroundStyle(HoardTheme.textBody)
      Spacer()
      if let onRetry {
        Button("Retry", action: onRetry).font(.mono(12)).tint(HoardTheme.accentHi)
      }
    }
    .padding(10)
    .background(HoardTheme.amber.opacity(0.08))
    .overlay(RoundedRectangle(cornerRadius: 8).stroke(HoardTheme.amber.opacity(0.3), lineWidth: 1))
    .clipShape(RoundedRectangle(cornerRadius: 8))
  }
}

public struct EmptyState: View {
  public var title: String
  public var hint: String
  public var systemImage: String
  public init(_ title: String, hint: String, systemImage: String) {
    self.title = title; self.hint = hint; self.systemImage = systemImage
  }
  public var body: some View {
    VStack(spacing: 8) {
      Image(systemName: systemImage).font(.system(size: 28)).foregroundStyle(HoardTheme.faint)
      Text(title).font(.inter(15, weight: .semibold)).foregroundStyle(HoardTheme.text)
      Text(hint).font(.inter(13)).foregroundStyle(HoardTheme.muted).multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(32)
    .overlay(RoundedRectangle(cornerRadius: HoardTheme.radiusCard).strokeBorder(HoardTheme.border, style: StrokeStyle(lineWidth: 1, dash: [6])))
  }
}
