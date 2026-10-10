import ExpoModulesCore

public final class ScreenCaptureModule: Module {
  private var host: ScreenCaptureHost?

  @MainActor
  private func captureHost() throws -> ScreenCaptureHost {
    if let host { return host }
    let host = try ScreenCaptureHost { [weak self] value in self?.sendEvent("screenRecordingState", value) }
    self.host = host; return host
  }
  public func definition() -> ModuleDefinition {
    Name("DeHubScreenCapture")
    Events("screenRecordingState")
    AsyncFunction("capabilities") { () async -> [String: Any] in await ScreenCaptureHost.capabilities() }
    AsyncFunction("status") { (id: String) async throws -> [String: Any]? in try await self.captureHost().status(id) }
    AsyncFunction("recover") { (scope: String) async throws -> [[String: Any]] in try await self.captureHost().recover(scope) }
    AsyncFunction("acknowledge") { (id: String) async throws in try await self.captureHost().acknowledge(id) }
    AsyncFunction("start") { (id: String, scope: String, playheadMs: Double, microphone: Bool, systemAudio: Bool, title: String, save: String, cancel: String) async throws in
      try await self.captureHost().start(id: id, scope: scope, playheadMs: playheadMs, microphone: microphone, systemAudio: systemAudio, title: title, save: save, cancel: cancel)
    }
    AsyncFunction("finish") { (id: String) async throws -> [String: Any] in try await self.captureHost().finish(id) }
    AsyncFunction("cancel") { (id: String) async throws in await (try self.captureHost()).cancel(id) }
    OnDestroy {
      Task { @MainActor in await self.host?.shutdown(); self.host = nil }
    }
  }
}
