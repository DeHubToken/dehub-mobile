import Foundation
import UIKit

@MainActor
final class ScreenCaptureHost {
  private let ledger: CaptureLedger
  private let event: ([String: Any]) -> Void
  private var owned: [String: String] = [:]
  private var drivers: [String: CaptureDriver] = [:]
  private var monitors: [String: Task<Void, Never>] = [:]
  private var finishes: [String: Task<[String: Any], Error>] = [:]

  init(event: @escaping ([String: Any]) -> Void) throws {
    ledger = try CaptureLedger(); self.event = event
    try ledger.invalidateDepartedPermissionRequests(hostInstanceId: captureHostInstanceId)
  }
  static func capabilities() -> [String: Any] {
    let storage = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: CaptureLedger.appGroup) != nil
    let upload = Bundle.main.builtInPlugInsURL?.appendingPathComponent("DeHubCaptureUpload.appex")
    let legacy = upload.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
    var modern = false
    if #available(iOS 27.0, *) { modern = true }
    return ["available": storage && (modern || legacy), "systemAudio": true, "microphone": true, "background": true]
  }

  func start(id: String, scope: String, playheadMs: Double, microphone: Bool, systemAudio: Bool, title: String, save: String, cancel: String) async throws {
    guard owned[id] == nil, Self.capabilities()["available"] as? Bool == true else { throw CaptureLedgerError.unavailable }
    var ticket = CaptureTicket(sessionId: id, scopeKey: scope, playheadMs: playheadMs, hostInstanceId: captureHostInstanceId,
      microphone: microphone, systemAudio: systemAudio, state: .pending, cancelRequested: false)
    ticket.title = title; ticket.saveLabel = save; ticket.cancelLabel = cancel
    if #available(iOS 27.0, *) { ticket.captureProvider = "stream" } else { ticket.captureProvider = "broadcast" }
    try ledger.reserve(ticket); owned[id] = scope
    do {
      let driver: CaptureDriver
      let changed: () -> Void = { [weak self] in self?.publish(id) }
      if #available(iOS 27.0, *) { driver = try ModernCaptureDriver(ticket: ticket, ledger: ledger, changed: changed) }
      else {
        guard var root = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows }).first(where: { $0.isKeyWindow })?.rootViewController else { throw CaptureLedgerError.unavailable }
        while let presented = root.presentedViewController { root = presented }
        driver = LegacyCaptureDriver(ticket: ticket, ledger: ledger, presenter: root, changed: changed)
      }
      drivers[id] = driver; monitor(id)
      try await driver.start()
      guard let current = try ledger.ticket(id, scopeKey: scope), !current.cancelRequested,
        [.recording, .finishing, .completed].contains(current.state) else { throw CancellationError() }
    } catch {
      await cancel(id)
      throw error
    }
  }

  func status(_ id: String) throws -> [String: Any]? {
    guard let scope = owned[id], let ticket = try ledger.ticket(id, scopeKey: scope) else { return nil }
    return try captureDictionary(ticket, ledger: ledger)
  }
  func recover(_ scope: String) throws -> [[String: Any]] {
    try ledger.completed(scopeKey: scope).map { ticket in
      owned[ticket.sessionId] = scope
      return try captureDictionary(ticket, ledger: ledger)
    }
  }
  func acknowledge(_ id: String) throws {
    guard let scope = owned[id] else { throw CaptureLedgerError.wrongScope }
    try ledger.acknowledge(id, scopeKey: scope)
    owned.removeValue(forKey: id); drivers.removeValue(forKey: id); finishes.removeValue(forKey: id)
    monitors.removeValue(forKey: id)?.cancel()
  }

  func finish(_ id: String) async throws -> [String: Any] {
    if let finishing = finishes[id] { return try await finishing.value }
    guard let scope = owned[id] else { throw CaptureLedgerError.wrongScope }
    let task = Task { @MainActor in
      guard let current = try self.ledger.ticket(id, scopeKey: scope), !current.cancelRequested else { throw CancellationError() }
      if current.state != .completed {
        try self.ledger.requestFinish(id, scopeKey: scope)
        await self.drivers[id]?.stop(cancel: false)
      }
      // Extension encoding can finish after ReplayKit's controller callback returns.
      let deadline = ProcessInfo.processInfo.systemUptime + 20
      while true {
        try Task.checkCancellation()
        guard let value = try self.ledger.ticket(id, scopeKey: scope), !value.cancelRequested else { throw CancellationError() }
        if value.validCompleted {
          let file = try self.ledger.recordingURL(id)
          try await blendCaptureAudio(file: file) {
            (try? self.ledger.ticket(id, scopeKey: scope))?.validCompleted == true
          }
          guard let saved = try self.ledger.ticket(id, scopeKey: scope), saved.validCompleted else { throw CancellationError() }
          return try captureDictionary(saved, ledger: self.ledger)
        }
        guard [.recording, .finishing].contains(value.state), ProcessInfo.processInfo.systemUptime < deadline else { throw CaptureLedgerError.unfinished }
        try await Task.sleep(nanoseconds: 100_000_000)
      }
    }
    finishes[id] = task
    do { return try await task.value }
    catch { finishes.removeValue(forKey: id); throw error }
  }

  func cancel(_ id: String) async {
    guard let scope = owned[id] else { return }
    try? ledger.requestCancel(id, scopeKey: scope)
    finishes[id]?.cancel()
    await drivers[id]?.stop(cancel: true)
    if let finishing = finishes[id] { _ = try? await finishing.value }
    if let value = try? ledger.ticket(id, scopeKey: scope), value.state == .pending {
      try? ledger.fail(id, scopeKey: scope, cancelled: true)
    }
    // A live upload extension retains its ticket until it has released the file.
    if let value = try? ledger.ticket(id, scopeKey: scope), [.completed, .failed, .cancelled].contains(value.state) {
      try? acknowledge(id)
    }
    publish(id)
  }
  func shutdown() async {
    for (id, scope) in Array(owned) {
      if (try? ledger.ticket(id, scopeKey: scope))?.state != .completed { await cancel(id) }
    }
    for task in monitors.values { task.cancel() }; monitors.removeAll()
  }
  private func publish(_ id: String) {
    if let value = try? status(id) { event(value) }
  }
  private func monitor(_ id: String) {
    monitors[id]?.cancel()
    monitors[id] = Task { @MainActor [weak self] in
      var previous: String?
      while !Task.isCancelled, let self, let scope = self.owned[id] {
        if let ticket = try? self.ledger.ticket(id, scopeKey: scope) {
          if previous != ticket.state.rawValue { previous = ticket.state.rawValue; self.publish(id) }
          if [.completed, .cancelled, .failed].contains(ticket.state) { return }
        }
        do { try await Task.sleep(nanoseconds: 250_000_000) } catch { return }
      }
    }
  }
}
