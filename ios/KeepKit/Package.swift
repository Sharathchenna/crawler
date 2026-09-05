// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "KeepKit",
  platforms: [.iOS(.v17)],
  products: [.library(name: "KeepKit", targets: ["KeepKit"])],
  dependencies: [
    .package(url: "https://github.com/apple/swift-markdown.git", from: "0.2.0"),
  ],
  targets: [
    .target(
      name: "KeepKit",
      dependencies: [.product(name: "Markdown", package: "swift-markdown")],
      path: "Sources/KeepKit"
    ),
  ]
)
