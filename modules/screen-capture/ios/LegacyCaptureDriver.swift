import Foundation
import ReplayKit
import UIKit

final class LegacyCaptureDriver: NSObject, CaptureDriver, RPBroadcastActivityViewControllerDelegate {
  static let uploadBundleId = "io.dehub.mobile.screen-capture-upload"
  private let ticket: CaptureTicket
  private let ledger: CaptureLedger
  private let changed: () -> Void
  private weak var presenter: UIViewController?
  private var activity: RPBroadcastActivityViewController?
  private var controller: RPBroadcastController?
  private var consent: CheckedContinuation<Void, Error>?
  private var stopped = false
  private var originalMicrophone: Bool?

  @MainActor
  init(ticket: CaptureTicket, ledger: CaptureLedger, presenter: UIViewController, changed: @escaping () -> Void) {
    self.ticket = ticket; self.ledger = ledger; self.presenter = presenter; self.changed = changed
    super.init()
  }

  @MainActor
  func start() async throws {
    originalMicrophone = RPScreenRecorder.shared().isMicrophoneEnabled
    RPScreenRecorder.shared().isMicrophoneEnabled = ticket.microphone
    try await withTaskCancellationHandler(operation: {
      try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
        guard !stopped else { done.resume(throwing: CancellationError()); return }
        consent = done
        RPBroadcastActivityViewController.load(withPreferredExtension: Self.uploadBundleId) { activity, error in
          Task { @MainActor in
            guard !self.stopped, self.consent != nil else { return }
            guard let activity, error == nil, let presenter = self.presenter else {
              self.consent?.resume(throwing: error ?? CaptureLedgerError.unavailable); self.consent = nil
              await self.stop(cancel: true); return
            }
            activity.delegate = self; self.activity = activity
            presenter.present(activity, animated: true)
          }
        }
      }
    }, onCancel: { Task { @MainActor in await self.stop(cancel: true) } })
  }

  func broadcastActivityViewController(_ broadcastActivityViewController: RPBroadcastActivityViewController, didFinishWith broadcastController: RPBroadcastController?, error: Error?) {
    Task { @MainActor in
      broadcastActivityViewController.dismiss(animated: true); self.activity = nil
      guard !self.stopped, self.consent != nil else { return }
      do {
        guard error == nil, let broadcastController,
          let current = try self.ledger.ticket(self.ticket.sessionId, scopeKey: self.ticket.scopeKey),
          current.state == .pending, !current.cancelRequested else { throw error ?? CancellationError() }
        self.controller = broadcastController
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
          broadcastController.startBroadcast { error in
            if let error { done.resume(throwing: error) } else { done.resume() }
          }
        }
        guard !self.stopped else {
          await self.finishController(broadcastController); throw CancellationError()
        }
        self.consent?.resume(); self.consent = nil; self.changed()
      } catch {
        self.consent?.resume(throwing: error); self.consent = nil
        await self.stop(cancel: true)
      }
    }
  }

  @MainActor
  private func finishController(_ value: RPBroadcastController) async {
    guard value.isBroadcasting else { return }
    await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
      value.finishBroadcast { _ in done.resume() }
    }
  }

  @MainActor
  func stop(cancel: Bool) async {
    guard !stopped else { return }; stopped = true
    consent?.resume(throwing: CancellationError()); consent = nil
    activity?.dismiss(animated: true); activity = nil
    if cancel { try? ledger.requestCancel(ticket.sessionId, scopeKey: ticket.scopeKey) }
    if let controller { await finishController(controller) }
    else if let current = try? ledger.ticket(ticket.sessionId, scopeKey: ticket.scopeKey), current.state == .pending {
      try? ledger.fail(ticket.sessionId, scopeKey: ticket.scopeKey, cancelled: true)
    } else { try? ledger.requestFinish(ticket.sessionId, scopeKey: ticket.scopeKey) }
    self.controller = nil
    if let originalMicrophone, RPScreenRecorder.shared().isMicrophoneEnabled == ticket.microphone {
      RPScreenRecorder.shared().isMicrophoneEnabled = originalMicrophone
    }
    self.originalMicrophone = nil; changed()
  }
}
