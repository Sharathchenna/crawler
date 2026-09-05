// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "KeepKit",
  platforms: [.iOS(.v17)],
  products: [.library(name: "KeepKit", targets: ["KeepKit"])],
  targets: [.target(name: "KeepKit", path: "Sources/KeepKit")]
)
