import XCTest
@testable import CaptureRecovery

final class CaptureLedgerTests: XCTestCase {
  private var root: URL!
  private var ledger: CaptureLedger!
  private let first = String(repeating: "a", count: 64)
  private let second = String(repeating: "b", count: 64)

  override func setUpWithError() throws {
    root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    ledger = try CaptureLedger(root: root)
  }
  override func tearDownWithError() throws { try FileManager.default.removeItem(at: root) }

  private func ticket(_ id: String = "capture_123", scope: String? = nil, host: String = "host_1234") -> CaptureTicket {
    CaptureTicket(sessionId: id, scopeKey: scope ?? first, playheadMs: 1250.5, hostInstanceId: host, microphone: true, systemAudio: true, state: .pending, cancelRequested: false)
  }
  private func complete(_ value: CaptureTicket) throws {
    try ledger.reserve(value)
    _ = try ledger.beginBroadcast(value.sessionId, scopeKey: value.scopeKey, hostInstanceId: value.hostInstanceId)
    try ledger.markFinishing(value.sessionId, scopeKey: value.scopeKey)
    try Data([1, 2, 3]).write(to: ledger.recordingURL(value.sessionId))
    try ledger.complete(value.sessionId, scopeKey: value.scopeKey, width: 1080, height: 1920, durationMs: 2000)
  }

  func testCompletedTakesSurviveAHostRestartInTheirOriginalScopeAndPlayhead() throws {
    try complete(ticket())
    try complete(ticket("capture_456", scope: second))
    let restarted = try CaptureLedger(root: root)
    let recovered = try restarted.completed(scopeKey: first)
    XCTAssertEqual(recovered.count, 1)
    XCTAssertEqual(recovered.first?.sessionId, "capture_123")
    XCTAssertEqual(recovered.first?.playheadMs, 1250.5)
    XCTAssertEqual(try restarted.completed(scopeKey: second).first?.sessionId, "capture_456")
  }

  func testForeignScopeCannotCancelOrDeleteAnotherProjectsCapture() throws {
    try complete(ticket())
    XCTAssertThrowsError(try ledger.requestCancel("capture_123", scopeKey: second))
    XCTAssertThrowsError(try ledger.acknowledge("capture_123", scopeKey: second))
    XCTAssertTrue(FileManager.default.fileExists(atPath: try ledger.recordingURL("capture_123").path))
    XCTAssertEqual(try ledger.completed(scopeKey: first).count, 1)
  }

  func testLatePermissionFromADepartedHostCannotStartANewBroadcast() throws {
    try ledger.reserve(ticket())
    try ledger.invalidateDepartedPermissionRequests(hostInstanceId: "host_5678")
    XCTAssertThrowsError(try ledger.beginBroadcast("capture_123", scopeKey: first, hostInstanceId: "host_1234"))
    try ledger.reserve(ticket("capture_456", host: "host_5678"))
    XCTAssertEqual(try ledger.beginBroadcast("capture_456", scopeKey: first, hostInstanceId: "host_5678").state, .recording)
  }

  func testHostRecreationRetainsTheRunningBroadcastAndCompletedFiles() throws {
    try ledger.reserve(ticket())
    _ = try ledger.beginBroadcast("capture_123", scopeKey: first, hostInstanceId: "host_1234")
    try ledger.invalidateDepartedPermissionRequests(hostInstanceId: "host_5678")
    XCTAssertEqual(try ledger.ticket("capture_123", scopeKey: first)?.state, .recording)
    XCTAssertThrowsError(try ledger.reserve(ticket("capture_456", host: "host_5678")))
  }

  func testAcknowledgementRequiresCompletionAndRetainsANewerTake() throws {
    try complete(ticket())
    try ledger.reserve(ticket("capture_456"))
    XCTAssertThrowsError(try ledger.acknowledge("capture_456", scopeKey: first))
    try ledger.acknowledge("capture_123", scopeKey: first)
    XCTAssertFalse(FileManager.default.fileExists(atPath: try ledger.recordingURL("capture_123").path))
    XCTAssertEqual(try ledger.ticket("capture_456", scopeKey: first)?.state, .pending)
  }

  func testInvalidCompletionDoesNotTurnAnUnfinishedFileIntoARecoverableTake() throws {
    try ledger.reserve(ticket())
    _ = try ledger.beginBroadcast("capture_123", scopeKey: first, hostInstanceId: "host_1234")
    try ledger.markFinishing("capture_123", scopeKey: first)
    try Data([1, 2, 3]).write(to: ledger.recordingURL("capture_123"))
    XCTAssertThrowsError(try ledger.complete("capture_123", scopeKey: first, width: 1081, height: 1920, durationMs: 2000))
    XCTAssertThrowsError(try ledger.complete("capture_123", scopeKey: first, width: 1080, height: 1920, durationMs: 249))
    XCTAssertTrue(try ledger.completed(scopeKey: first).isEmpty)
    XCTAssertEqual(try ledger.ticket("capture_123", scopeKey: first)?.state, .finishing)
  }

  func testUnsafeIdentifiersAndUnboundScopesCannotReserveFiles() throws {
    XCTAssertThrowsError(try ledger.recordingURL("../escape"))
    XCTAssertThrowsError(try ledger.reserve(ticket(scope: "0x" + String(repeating: "a", count: 40))))
    var invalid = ticket(); invalid = CaptureTicket(sessionId: invalid.sessionId, scopeKey: invalid.scopeKey, playheadMs: .infinity, hostInstanceId: invalid.hostInstanceId, microphone: false, systemAudio: true, state: .pending, cancelRequested: false)
    XCTAssertThrowsError(try ledger.reserve(invalid))
    try ledger.reserve(ticket())
  }

  func testMissingCompletedFilesAreNotOfferedForImport() throws {
    try complete(ticket())
    try FileManager.default.removeItem(at: ledger.recordingURL("capture_123"))
    XCTAssertTrue(try ledger.completed(scopeKey: first).isEmpty)
  }
}
