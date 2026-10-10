import Foundation
import CoreMedia
import AVFoundation
import ScreenCaptureKit

@available(iOS 27.0, *)
final class ModernCaptureDriver: NSObject, CaptureDriver, SCContentSharingPickerObserver, SCStreamOutput, SCStreamDelegate {
  private let ticket: CaptureTicket
  private let ledger: CaptureLedger
  private let movie: CaptureMovieWriter
  private let changed: () -> Void
  private var stream: SCStream?
  private var consent: CheckedContinuation<Void, Error>?
  private var stopped = false
  private var recording = false
  private var maximum: Task<Void, Never>?
  private var previousAudioCategory: AVAudioSession.Category?
  private var previousAudioMode: AVAudioSession.Mode?
  private var previousAudioOptions: AVAudioSession.CategoryOptions?

  @MainActor
  init(ticket: CaptureTicket, ledger: CaptureLedger, changed: @escaping () -> Void) throws {
    self.ticket = ticket; self.ledger = ledger; self.changed = changed
    movie = CaptureMovieWriter(file: try ledger.recordingURL(ticket.sessionId), microphone: ticket.microphone, systemAudio: ticket.systemAudio) { _ in }
    super.init()
    movie.failure = { [weak self] _ in Task { @MainActor in await self?.stop(cancel: true) } }
  }

  @MainActor
  func start() async throws {
    let picker = SCContentSharingPicker.shared
    var configuration = SCContentSharingPickerConfiguration()
    configuration.showsMicrophoneControl = ticket.microphone
    configuration.showsCameraControl = false
    picker.defaultConfiguration = configuration
    picker.add(self); picker.isActive = true
    try await withTaskCancellationHandler(operation: {
      try await withCheckedThrowingContinuation { done in
        guard !stopped else { done.resume(throwing: CancellationError()); return }
        consent = done; picker.present()
      }
    }, onCancel: { Task { @MainActor in await self.stop(cancel: true) } })
  }

  func contentSharingPicker(_ picker: SCContentSharingPicker, didUpdateWith filter: SCContentFilter, for stream: SCStream?) {
    Task { @MainActor in
      // Updates to a running stream are applied by the system picker itself.
      guard !self.stopped, !self.recording, stream == nil, self.consent != nil else { return }
      do {
        guard let current = try self.ledger.ticket(self.ticket.sessionId, scopeKey: self.ticket.scopeKey),
          current.state == .pending, !current.cancelRequested else { throw CancellationError() }
        let configuration = SCStreamConfiguration()
        configuration.capturesAudio = self.ticket.systemAudio
        let capture = SCStream(filter: filter, configuration: configuration, delegate: self)
        self.stream = capture
        try capture.addStreamOutput(self, type: .screen, sampleHandlerQueue: self.movie.queue)
        if self.ticket.systemAudio { try capture.addStreamOutput(self, type: .audio, sampleHandlerQueue: self.movie.queue) }
        if self.ticket.microphone && filter.isMicrophoneEnabled {
          let audio = AVAudioSession.sharedInstance()
          self.previousAudioCategory = audio.category
          self.previousAudioMode = audio.mode
          self.previousAudioOptions = audio.categoryOptions
          try audio.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker])
          try audio.setActive(true)
          try capture.addStreamOutput(self, type: .microphone, sampleHandlerQueue: self.movie.queue)
        }
        _ = try self.ledger.beginBroadcast(self.ticket.sessionId, scopeKey: self.ticket.scopeKey, hostInstanceId: self.ticket.hostInstanceId)
        self.recording = true
        try await capture.startCapture()
        guard !self.stopped else { try? await capture.stopCapture(); throw CancellationError() }
        self.consent?.resume(); self.consent = nil; self.changed()
        self.maximum = Task { @MainActor in
          do { try await Task.sleep(nanoseconds: 600_000_000_000) } catch { return }
          await self.stop(cancel: false)
        }
      } catch {
        self.consent?.resume(throwing: error); self.consent = nil
        await self.stop(cancel: true)
      }
    }
  }

  func contentSharingPicker(_ picker: SCContentSharingPicker, didCancelFor stream: SCStream?) {
    Task { @MainActor in if !self.recording { await self.stop(cancel: true) } }
  }
  func contentSharingPickerStartDidFailWithError(_ error: Error) {
    Task { @MainActor in self.consent?.resume(throwing: error); self.consent = nil; await self.stop(cancel: true) }
  }
  func stream(_ stream: SCStream, didStopWithError error: Error) {
    Task { @MainActor in await self.stop(cancel: false) }
  }
  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
    switch type {
    case .screen:
      let info = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]]
      if let status = info?.first?[.status] as? Int, status != SCFrameStatus.complete.rawValue { return }
      let orientation = (info?.first?[.videoOrientation] as? NSNumber)?.int32Value ?? 1
      movie.appendVideo(sampleBuffer, orientation: orientation)
    case .audio: movie.appendAudio(sampleBuffer, source: "system")
    case .microphone: movie.appendAudio(sampleBuffer, source: "microphone")
    @unknown default: break
    }
  }

  @MainActor
  func stop(cancel: Bool) async {
    guard !stopped else { return }; stopped = true; maximum?.cancel(); maximum = nil
    consent?.resume(throwing: CancellationError()); consent = nil
    let picker = SCContentSharingPicker.shared; picker.remove(self); picker.isActive = false
    if cancel { try? ledger.requestCancel(ticket.sessionId, scopeKey: ticket.scopeKey) }
    if let stream { try? await stream.stopCapture() }
    self.stream = nil
    if let category = previousAudioCategory, let mode = previousAudioMode, let options = previousAudioOptions {
      let audio = AVAudioSession.sharedInstance()
      try? audio.setActive(false, options: .notifyOthersOnDeactivation)
      try? audio.setCategory(category, mode: mode, options: options)
      previousAudioCategory = nil; previousAudioMode = nil; previousAudioOptions = nil
    }
    if recording { try? ledger.markFinishing(ticket.sessionId, scopeKey: ticket.scopeKey) }
    let result: Result<CaptureMovieMetadata, Error> = await withCheckedContinuation { done in
      movie.queue.async { self.movie.finish(cancel: cancel) { done.resume(returning: $0) } }
    }
    do {
      let metadata = try result.get()
      try ledger.complete(ticket.sessionId, scopeKey: ticket.scopeKey, width: metadata.width, height: metadata.height, durationMs: metadata.durationMs)
    } catch { try? ledger.fail(ticket.sessionId, scopeKey: ticket.scopeKey, cancelled: cancel) }
    changed()
  }
}
