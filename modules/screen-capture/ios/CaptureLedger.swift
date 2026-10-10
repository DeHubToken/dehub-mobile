import Foundation

enum CaptureLedgerError: Error {
  case invalidTicket, unavailable, busy, wrongScope, unfinished
}

struct CaptureTicket: Codable, Equatable {
  enum State: String, Codable { case pending, recording, finishing, completed, cancelled, failed }
  let sessionId: String
  let scopeKey: String
  let playheadMs: Double
  let hostInstanceId: String
  let microphone: Bool
  let systemAudio: Bool
  var state: State
  var cancelRequested: Bool
  var width: Int? = nil
  var height: Int? = nil
  var durationMs: Double? = nil
  var captureProvider: String? = nil
  var title: String? = nil
  var saveLabel: String? = nil
  var cancelLabel: String? = nil
  var stopRequested: Bool? = nil

  var valid: Bool {
    Self.validId(sessionId) && Self.validId(hostInstanceId) &&
      scopeKey.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil &&
      playheadMs.isFinite && playheadMs >= 0
  }
  var validCompleted: Bool {
    guard valid, state == .completed, !cancelRequested,
      let width, let height, let durationMs else { return false }
    return (2...1920).contains(width) && (2...1920).contains(height) &&
      width % 2 == 0 && height % 2 == 0 && durationMs.isFinite && (250...602_000).contains(durationMs)
  }
  static func validId(_ value: String) -> Bool {
    value.range(of: "^[a-zA-Z0-9_-]{8,64}$", options: .regularExpression) != nil
  }
}

/** Shared by the host and broadcast extensions; every mutation uses file coordination. */
final class CaptureLedger {
  static let appGroup = "group.io.dehub.mobile.screen-capture"
  private struct Saved: Codable { var version = 1; var tickets: [String: CaptureTicket] = [:] }
  private let directory: URL
  private let ledgerURL: URL

  convenience init() throws {
    guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroup) else {
      throw CaptureLedgerError.unavailable
    }
    try self.init(root: root)
  }
  init(root: URL) throws {
    directory = root.appendingPathComponent("screen-recordings", isDirectory: true)
    ledgerURL = directory.appendingPathComponent("ledger.json")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  }

  func recordingURL(_ sessionId: String) throws -> URL {
    guard CaptureTicket.validId(sessionId) else { throw CaptureLedgerError.invalidTicket }
    return directory.appendingPathComponent(sessionId).appendingPathExtension("mp4")
  }

  private func read(_ url: URL) throws -> Saved {
    if !FileManager.default.fileExists(atPath: url.path) { return Saved() }
    let saved = try JSONDecoder().decode(Saved.self, from: Data(contentsOf: url))
    guard saved.version == 1, saved.tickets.count <= 4,
      saved.tickets.allSatisfy({ $0.key == $0.value.sessionId && $0.value.valid }) else {
      throw CaptureLedgerError.invalidTicket
    }
    return saved
  }

  private func change<T>(_ action: (inout Saved) throws -> T) throws -> T {
    var coordinationError: NSError?
    var result: Result<T, Error>?
    NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: ledgerURL, options: .forReplacing, error: &coordinationError) { url in
      result = Result {
        var saved = try read(url)
        let value = try action(&saved)
        try JSONEncoder().encode(saved).write(to: url, options: .atomic)
        return value
      }
    }
    if let coordinationError { throw coordinationError }
    guard let result else { throw CaptureLedgerError.unavailable }
    return try result.get()
  }

  private func inspect<T>(_ action: (Saved) throws -> T) throws -> T {
    var coordinationError: NSError?
    var result: Result<T, Error>?
    NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: ledgerURL, options: [], error: &coordinationError) { url in
      result = Result { try action(read(url)) }
    }
    if let coordinationError { throw coordinationError }
    guard let result else { throw CaptureLedgerError.unavailable }
    return try result.get()
  }

  func reserve(_ ticket: CaptureTicket) throws {
    guard ticket.valid, ticket.state == .pending, !ticket.cancelRequested,
      ticket.width == nil, ticket.height == nil, ticket.durationMs == nil else { throw CaptureLedgerError.invalidTicket }
    try change { saved in
      guard saved.tickets[ticket.sessionId] == nil, saved.tickets.count < 4,
        !saved.tickets.values.contains(where: { [.pending, .recording, .finishing].contains($0.state) }) else {
        throw CaptureLedgerError.busy
      }
      saved.tickets[ticket.sessionId] = ticket
    }
  }

  func beginBroadcast(_ sessionId: String, scopeKey: String, hostInstanceId: String) throws -> CaptureTicket {
    try change { saved in
      guard var ticket = saved.tickets[sessionId], ticket.scopeKey == scopeKey,
        ticket.hostInstanceId == hostInstanceId, ticket.state == .pending, !ticket.cancelRequested else {
        throw CaptureLedgerError.wrongScope
      }
      ticket.state = .recording; saved.tickets[sessionId] = ticket
      return ticket
    }
  }

  func ticket(_ sessionId: String, scopeKey: String) throws -> CaptureTicket? {
    try inspect { saved in
      guard let ticket = saved.tickets[sessionId], ticket.scopeKey == scopeKey else { return nil }
      return ticket
    }
  }

  func pendingConsent() throws -> CaptureTicket? {
    try inspect { saved in
      let pending = saved.tickets.values.filter { $0.state == .pending && !$0.cancelRequested }
      return pending.count == 1 ? pending.first : nil
    }
  }

  func requestFinish(_ sessionId: String, scopeKey: String) throws {
    try change { saved in
      guard var ticket = saved.tickets[sessionId], ticket.scopeKey == scopeKey,
        [.recording, .finishing, .completed].contains(ticket.state) else { throw CaptureLedgerError.wrongScope }
      ticket.stopRequested = true; saved.tickets[sessionId] = ticket
    }
  }

  func requestCancel(_ sessionId: String, scopeKey: String) throws {
    try change { saved in
      guard var ticket = saved.tickets[sessionId], ticket.scopeKey == scopeKey else { throw CaptureLedgerError.wrongScope }
      ticket.cancelRequested = true; saved.tickets[sessionId] = ticket
    }
  }

  func markFinishing(_ sessionId: String, scopeKey: String) throws {
    try change { saved in
      guard var ticket = saved.tickets[sessionId], ticket.scopeKey == scopeKey,
        ticket.state == .recording else { throw CaptureLedgerError.wrongScope }
      ticket.state = .finishing; saved.tickets[sessionId] = ticket
    }
  }

  func complete(_ sessionId: String, scopeKey: String, width: Int, height: Int, durationMs: Double) throws {
    let url = try recordingURL(sessionId)
    let bytes = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard bytes > 0 else { throw CaptureLedgerError.invalidTicket }
    try change { saved in
      guard var ticket = saved.tickets[sessionId], ticket.scopeKey == scopeKey,
        ticket.state == .finishing, !ticket.cancelRequested else { throw CaptureLedgerError.wrongScope }
      ticket.width = width; ticket.height = height; ticket.durationMs = durationMs; ticket.state = .completed
      guard ticket.validCompleted else { throw CaptureLedgerError.invalidTicket }
      saved.tickets[sessionId] = ticket
    }
  }

  func fail(_ sessionId: String, scopeKey: String, cancelled: Bool) throws {
    try change { saved in
      guard var ticket = saved.tickets[sessionId], ticket.scopeKey == scopeKey,
        ticket.state != .completed else { throw CaptureLedgerError.wrongScope }
      ticket.state = cancelled ? .cancelled : .failed; saved.tickets[sessionId] = ticket
    }
    try removeFile(sessionId)
  }

  func invalidateDepartedPermissionRequests(hostInstanceId: String) throws {
    let incomplete: [String] = try change { saved in
      let departed = saved.tickets.values.filter { $0.state == .pending && $0.hostInstanceId != hostInstanceId }.map { $0.sessionId }
      for id in departed { saved.tickets.removeValue(forKey: id) }
      let interrupted = saved.tickets.values.filter { $0.captureProvider == "stream" && $0.hostInstanceId != hostInstanceId && [.recording, .finishing].contains($0.state) }.map { $0.sessionId }
      for id in interrupted { saved.tickets[id]?.state = .failed }
      return interrupted
    }
    for id in incomplete { try removeFile(id) }
  }

  func completed(scopeKey: String) throws -> [CaptureTicket] {
    try inspect { saved in
      try saved.tickets.values.filter { ticket in
        guard ticket.scopeKey == scopeKey, ticket.validCompleted else { return false }
        guard FileManager.default.fileExists(atPath: try recordingURL(ticket.sessionId).path) else { return false }
        return try recordingURL(ticket.sessionId).resourceValues(forKeys: [.fileSizeKey]).fileSize.map { $0 > 0 } ?? false
      }.sorted { $0.sessionId < $1.sessionId }
    }
  }

  func acknowledge(_ sessionId: String, scopeKey: String) throws {
    try change { saved in
      guard let ticket = saved.tickets[sessionId], ticket.scopeKey == scopeKey else { throw CaptureLedgerError.wrongScope }
      guard [.completed, .cancelled, .failed].contains(ticket.state) else { throw CaptureLedgerError.unfinished }
      saved.tickets.removeValue(forKey: sessionId)
    }
    try removeFile(sessionId)
  }

  private func removeFile(_ sessionId: String) throws {
    let url = try recordingURL(sessionId)
    if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
  }
}
