import SwiftUI

/// Design tokens mirroring the web product exactly (Linear aesthetic, dark-first).
public enum HoardTheme {
  // Canvas / surfaces (dark canonical)
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
}

public extension Color {
  init(hex: String) {
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
  static func inter(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    .custom("Inter", size: size).weight(weight)
  }
  /// JetBrains Mono for code, CLI blocks, tokens, timestamps, metadata labels.
  static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    .custom("JetBrainsMono-Regular", size: size).weight(weight)
  }
  /// Tight title treatment: one weight, one color, -0.02em tracking.
  static func title(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
    .system(size: size, weight: weight == .semibold ? .semibold : .regular, design: .default)
  }
}
