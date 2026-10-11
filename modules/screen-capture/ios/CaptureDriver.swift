import Foundation

@MainActor
protocol CaptureDriver: AnyObject {
  func start() async throws
  func stop(cancel: Bool) async
}

// React module recreation must not impersonate a new operating-system process.
let captureHostInstanceId = UUID().uuidString

func captureDictionary(_ ticket: CaptureTicket, ledger: CaptureLedger) throws -> [String: Any] {
  var value: [String: Any] = ["sessionId": ticket.sessionId, "scopeKey": ticket.scopeKey,
    "playheadMs": ticket.playheadMs, "state": ticket.state.rawValue]
  if ticket.validCompleted {
    value["uri"] = try ledger.recordingURL(ticket.sessionId).absoluteString
    value["width"] = ticket.width; value["height"] = ticket.height; value["durationMs"] = ticket.durationMs
  }
  return value
}
