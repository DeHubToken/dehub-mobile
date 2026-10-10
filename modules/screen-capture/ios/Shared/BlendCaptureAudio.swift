import AVFoundation
import Foundation

/** The durable capture keeps both sources until the host can create one mixed audio track. */
@MainActor
func blendCaptureAudio(file: URL, isCurrent: @escaping () -> Bool) async throws {
  guard isCurrent(), !Task.isCancelled else { throw CancellationError() }
  let asset = AVURLAsset(url: file)
  let sources = try await asset.loadTracks(withMediaType: .audio)
  if sources.count <= 1 { return }
  guard let sourceVideo = try await asset.loadTracks(withMediaType: .video).first else { throw CaptureLedgerError.invalidTicket }
  let duration = try await asset.load(.duration)
  guard duration.isNumeric, CMTimeGetSeconds(duration) >= 0.25 else { throw CaptureLedgerError.invalidTicket }
  let range = CMTimeRange(start: .zero, duration: duration)
  let composition = AVMutableComposition()
  guard let video = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw CaptureLedgerError.unavailable }
  try video.insertTimeRange(range, of: sourceVideo, at: .zero)
  video.preferredTransform = try await sourceVideo.load(.preferredTransform)
  var parameters: [AVMutableAudioMixInputParameters] = []
  for source in sources {
    let available = try await source.load(.timeRange)
    let audioRange = CMTimeRangeGetIntersection(range, otherRange: available)
    if audioRange.isEmpty { continue }
    guard let audio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw CaptureLedgerError.unavailable }
    try audio.insertTimeRange(audioRange, of: source, at: audioRange.start)
    let gain = AVMutableAudioMixInputParameters(track: audio)
    gain.setVolume(1.0 / Float(sources.count), at: .zero); parameters.append(gain)
  }
  guard parameters.count == sources.count else { throw CaptureLedgerError.invalidTicket }
  let mix = AVMutableAudioMix(); mix.inputParameters = parameters
  guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { throw CaptureLedgerError.unavailable }
  let output = file.deletingLastPathComponent().appendingPathComponent("mix-\(UUID().uuidString).mp4")
  defer { try? FileManager.default.removeItem(at: output) }
  exporter.outputURL = output; exporter.outputFileType = .mp4; exporter.audioMix = mix
  exporter.shouldOptimizeForNetworkUse = true
  try await withTaskCancellationHandler(operation: {
    try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
      exporter.exportAsynchronously {
        if exporter.status == .completed { done.resume() }
        else { done.resume(throwing: exporter.error ?? CaptureLedgerError.unfinished) }
      }
    }
  }, onCancel: { exporter.cancelExport() })
  guard isCurrent(), !Task.isCancelled else { throw CancellationError() }
  let combined = AVURLAsset(url: output)
  guard try await combined.loadTracks(withMediaType: .audio).count == 1,
    try await combined.loadTracks(withMediaType: .video).count == 1 else { throw CaptureLedgerError.invalidTicket }
  _ = try FileManager.default.replaceItemAt(file, withItemAt: output)
}
