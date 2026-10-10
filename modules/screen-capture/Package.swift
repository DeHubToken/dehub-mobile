// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "CaptureRecovery",
  platforms: [.macOS(.v13), .iOS(.v15)],
  products: [.library(name: "CaptureRecovery", targets: ["CaptureRecovery"])],
  targets: [
    .target(name: "CaptureRecovery", path: "ios", sources: ["CaptureLedger.swift"]),
    .testTarget(name: "CaptureRecoveryTests", dependencies: ["CaptureRecovery"], path: "ios-tests"),
  ]
)
