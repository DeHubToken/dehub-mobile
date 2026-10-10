import AVFoundation
import CoreImage
import CoreMedia
import CoreVideo
import Foundation

struct CaptureMovieMetadata {
  let width: Int
  let height: Int
  let durationMs: Double
}

/** Screen frames use a fixed canvas and both audio sources retain the capture clock. */
final class CaptureMovieWriter {
  let queue = DispatchQueue(label: "io.dehub.screen-capture.writer")
  private let file: URL
  private let microphone: Bool
  private let systemAudio: Bool
  var failure: (Error) -> Void
  private let context = CIContext(options: [.cacheIntermediates: false])
  private let colorSpace = CGColorSpaceCreateDeviceRGB()
  private var writer: AVAssetWriter?
  private var video: AVAssetWriterInput?
  private var pixelAdaptor: AVAssetWriterInputPixelBufferAdaptor?
  private var audio: [String: AVAssetWriterInput] = [:]
  private var canvas: CaptureCanvas?
  private var latestFrame: CIImage?
  private var firstPTS: CMTime?
  private var startedWall: TimeInterval = 0
  private var lastVideoPTS: CMTime = .invalid
  private var timer: DispatchSourceTimer?
  private var stopped = false
  private var captureError: Error?

  init(file: URL, microphone: Bool, systemAudio: Bool, failure: @escaping (Error) -> Void) {
    self.file = file; self.microphone = microphone; self.systemAudio = systemAudio; self.failure = failure
  }

  // Callers deliver all sample buffers on queue, including ReplayKit callbacks.
  func appendVideo(_ buffer: CMSampleBuffer, orientation: Int32 = 1) {
    guard !stopped, CMSampleBufferDataIsReady(buffer), let pixels = CMSampleBufferGetImageBuffer(buffer) else { return }
    do {
      let image = CIImage(cvPixelBuffer: pixels).oriented(forExifOrientation: orientation)
      latestFrame = image
      if writer == nil {
        let pts = CMSampleBufferGetPresentationTimeStamp(buffer)
        guard pts.isNumeric else { throw CaptureLedgerError.invalidTicket }
        firstPTS = pts; startedWall = ProcessInfo.processInfo.systemUptime
        try prepare(width: Int(image.extent.width), height: Int(image.extent.height))
        renderFrame()
        let clock = DispatchSource.makeTimerSource(queue: queue)
        clock.schedule(deadline: .now() + .nanoseconds(1_000_000_000 / 30), repeating: .nanoseconds(1_000_000_000 / 30))
        clock.setEventHandler { [weak self] in self?.renderFrame() }
        timer = clock; clock.resume()
      }
    } catch { fail(error) }
  }

  func appendAudio(_ buffer: CMSampleBuffer, source: String) {
    guard !stopped, CMSampleBufferDataIsReady(buffer), let input = audio[source], input.isReadyForMoreMediaData,
      let firstPTS else { return }
    do {
      var needed = 0
      let status = CMSampleBufferGetSampleTimingInfoArray(buffer, entryCount: 0, arrayToFill: nil, entriesNeededOut: &needed)
      guard status == noErr, needed > 0 else { throw CaptureLedgerError.invalidTicket }
      var timing = [CMSampleTimingInfo](repeating: CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: .invalid, decodeTimeStamp: .invalid), count: needed)
      let copied = timing.withUnsafeMutableBufferPointer {
        CMSampleBufferGetSampleTimingInfoArray(buffer, entryCount: needed, arrayToFill: $0.baseAddress, entriesNeededOut: &needed)
      }
      guard copied == noErr else { throw CaptureLedgerError.invalidTicket }
      for index in timing.indices {
        timing[index].presentationTimeStamp = CMTimeSubtract(timing[index].presentationTimeStamp, firstPTS)
        if timing[index].decodeTimeStamp.isNumeric { timing[index].decodeTimeStamp = CMTimeSubtract(timing[index].decodeTimeStamp, firstPTS) }
        if !timing[index].presentationTimeStamp.isNumeric || CMTimeCompare(timing[index].presentationTimeStamp, .zero) < 0 { return }
      }
      var retimed: CMSampleBuffer?
      let retime = timing.withUnsafeBufferPointer {
        CMSampleBufferCreateCopyWithNewTiming(allocator: kCFAllocatorDefault, sampleBuffer: buffer, sampleTimingEntryCount: needed, sampleTimingArray: $0.baseAddress!, sampleBufferOut: &retimed)
      }
      guard retime == noErr, let retimed, input.append(retimed) else { throw writer?.error ?? CaptureLedgerError.invalidTicket }
    } catch { fail(error) }
  }

  private func prepare(width: Int, height: Int) throws {
    let size = captureCanvas(width: width, height: height); canvas = size
    let output = try AVAssetWriter(outputURL: file, fileType: .mp4); writer = output
    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: size.width, AVVideoHeightKey: size.height,
      AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 4_000_000, AVVideoExpectedSourceFrameRateKey: 30, AVVideoMaxKeyFrameIntervalKey: 30],
    ])
    videoInput.expectsMediaDataInRealTime = true
    guard output.canAdd(videoInput) else { throw CaptureLedgerError.unavailable }
    output.add(videoInput); video = videoInput
    pixelAdaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: size.width, kCVPixelBufferHeightKey as String: size.height,
      kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any],
    ])
    for source in (systemAudio ? ["system"] : []) + (microphone ? ["microphone"] : []) {
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48_000, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 128_000])
      input.expectsMediaDataInRealTime = true
      guard output.canAdd(input) else { throw CaptureLedgerError.unavailable }
      output.add(input); audio[source] = input
    }
    guard output.startWriting() else { throw output.error ?? CaptureLedgerError.unavailable }
    output.startSession(atSourceTime: .zero)
  }

  private func renderFrame() {
    guard !stopped, let frame = latestFrame, let canvas, let video, video.isReadyForMoreMediaData,
      let pixelAdaptor, let pool = pixelAdaptor.pixelBufferPool else { return }
    do {
      let elapsed = max(0, ProcessInfo.processInfo.systemUptime - startedWall)
      let currentFrame = lastVideoPTS.isNumeric ? Int64(elapsed * 30) : 0
      let nextFrame = lastVideoPTS.isNumeric ? lastVideoPTS.value + 1 : 0
      if currentFrame < nextFrame { return }
      var buffer: CVPixelBuffer?
      guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &buffer) == kCVReturnSuccess, let buffer else { throw CaptureLedgerError.unavailable }
      let fit = fittedCaptureRect(source: frame.extent.size, canvas: canvas)
      let scale = fit.width / frame.extent.width
      let positioned = frame.transformed(by: CGAffineTransform(translationX: -frame.extent.minX, y: -frame.extent.minY))
        .transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        .transformed(by: CGAffineTransform(translationX: fit.minX, y: fit.minY))
      let bounds = CGRect(x: 0, y: 0, width: CGFloat(canvas.width), height: CGFloat(canvas.height))
      let black = CIImage(color: .black).cropped(to: bounds)
      context.render(positioned.composited(over: black), to: buffer, bounds: bounds, colorSpace: colorSpace)
      // A busy encoder can miss a timer tick. Retain the clock with bounded repeated frames.
      // Cap catch-up at one second so a long system pause cannot create an unbounded queue.
      for index in max(nextFrame, currentFrame - 29)...currentFrame {
        guard video.isReadyForMoreMediaData else { break }
        let pts = CMTime(value: index, timescale: 30)
        guard pixelAdaptor.append(buffer, withPresentationTime: pts) else { throw writer?.error ?? CaptureLedgerError.unavailable }
        lastVideoPTS = pts
      }
    } catch { fail(error) }
  }

  private func fail(_ error: Error) {
    guard captureError == nil else { return }
    captureError = error; failure(error)
  }

  func finish(cancel: Bool, completion: @escaping (Result<CaptureMovieMetadata, Error>) -> Void) {
    guard !stopped else { completion(.failure(CaptureLedgerError.unfinished)); return }
    renderFrame(); stopped = true; timer?.cancel(); timer = nil; latestFrame = nil
    guard let writer, let canvas, lastVideoPTS.isNumeric else {
      completion(.failure(captureError ?? CaptureLedgerError.unfinished)); return
    }
    if cancel || captureError != nil {
      writer.cancelWriting(); try? FileManager.default.removeItem(at: file)
      completion(.failure(captureError ?? CaptureLedgerError.unfinished)); return
    }
    video?.markAsFinished(); for input in audio.values { input.markAsFinished() }
    let durationMs = (CMTimeGetSeconds(lastVideoPTS) + 1.0 / 30.0) * 1000.0
    writer.endSession(atSourceTime: CMTimeAdd(lastVideoPTS, CMTime(value: 1, timescale: 30)))
    writer.finishWriting {
      self.queue.async {
        if writer.status == .completed && durationMs >= 250 {
          completion(.success(CaptureMovieMetadata(width: canvas.width, height: canvas.height, durationMs: durationMs)))
        } else {
          try? FileManager.default.removeItem(at: self.file)
          completion(.failure(writer.error ?? CaptureLedgerError.unfinished))
        }
      }
    }
  }
}
