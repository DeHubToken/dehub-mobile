import AVFoundation
import CoreImage
import XCTest
@testable import CaptureRecovery

final class CaptureMovieTests: XCTestCase {
  private var directory: URL!
  override func setUpWithError() throws {
    directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  }
  override func tearDownWithError() throws { try FileManager.default.removeItem(at: directory) }

  private func videoFrame() throws -> CMSampleBuffer {
    var pixels: CVPixelBuffer?
    XCTAssertEqual(CVPixelBufferCreate(kCFAllocatorDefault, 100, 200, kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey as String: [:]] as CFDictionary, &pixels), kCVReturnSuccess)
    let buffer = try XCTUnwrap(pixels)
    CIContext(options: [.cacheIntermediates: false]).render(CIImage(color: .white).cropped(to: CGRect(x: 0, y: 0, width: 100, height: 200)), to: buffer)
    var format: CMVideoFormatDescription?
    XCTAssertEqual(CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: buffer, formatDescriptionOut: &format), noErr)
    var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: 30), presentationTimeStamp: CMTime(value: 10, timescale: 1), decodeTimeStamp: .invalid)
    var sample: CMSampleBuffer?
    XCTAssertEqual(CMSampleBufferCreateReadyWithImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: buffer, formatDescription: try XCTUnwrap(format), sampleTiming: &timing, sampleBufferOut: &sample), noErr)
    return try XCTUnwrap(sample)
  }

  private func audioFrame(index: Int, frequency: Double) throws -> CMSampleBuffer {
    let count = 960
    var pcm = (0..<count).map { offset in Int16(sin(2 * Double.pi * frequency * Double(index * count + offset) / 48_000) * 12_000) }
    var block: CMBlockBuffer?
    XCTAssertEqual(CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: count * 2, blockAllocator: kCFAllocatorDefault, customBlockSource: nil, offsetToData: 0, dataLength: count * 2, flags: 0, blockBufferOut: &block), noErr)
    let data = try XCTUnwrap(block)
    pcm.withUnsafeMutableBytes { bytes in XCTAssertEqual(CMBlockBufferReplaceDataBytes(with: bytes.baseAddress!, blockBuffer: data, offsetIntoDestination: 0, dataLength: count * 2), noErr) }
    var asbd = AudioStreamBasicDescription(mSampleRate: 48_000, mFormatID: kAudioFormatLinearPCM, mFormatFlags: kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked, mBytesPerPacket: 2, mFramesPerPacket: 1, mBytesPerFrame: 2, mChannelsPerFrame: 1, mBitsPerChannel: 16, mReserved: 0)
    var format: CMAudioFormatDescription?
    XCTAssertEqual(CMAudioFormatDescriptionCreate(allocator: kCFAllocatorDefault, asbd: &asbd, layoutSize: 0, layout: nil, magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &format), noErr)
    var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: 48_000), presentationTimeStamp: CMTime(value: Int64(480_000 + index * count), timescale: 48_000), decodeTimeStamp: .invalid)
    var sample: CMSampleBuffer?
    XCTAssertEqual(CMSampleBufferCreateReady(allocator: kCFAllocatorDefault, dataBuffer: data, formatDescription: try XCTUnwrap(format), sampleCount: count, sampleTimingEntryCount: 1, sampleTimingArray: &timing, sampleSizeEntryCount: 0, sampleSizeArray: nil, sampleBufferOut: &sample), noErr)
    return try XCTUnwrap(sample)
  }

  private func record(audio: Bool) async throws -> (URL, CaptureMovieMetadata) {
    let url = directory.appendingPathComponent("recording.mp4")
    let frame = try videoFrame()
    let sources = try (0..<20).map { index in (try audioFrame(index: index, frequency: 440), try audioFrame(index: index, frequency: 880)) }
    let movie = CaptureMovieWriter(file: url, microphone: audio, systemAudio: audio) { error in XCTFail("Capture failed: \(error)") }
    let metadata: CaptureMovieMetadata = try await withCheckedThrowingContinuation { done in
      movie.queue.async {
        movie.appendVideo(frame)
        if audio {
          for (index, pair) in sources.enumerated() {
            movie.queue.asyncAfter(deadline: .now() + Double(index) * 0.02) {
              movie.appendAudio(pair.0, source: "system"); movie.appendAudio(pair.1, source: "microphone")
            }
          }
        }
        movie.queue.asyncAfter(deadline: .now() + 0.45) { movie.finish(cancel: false) { done.resume(with: $0) } }
      }
    }
    return (url, metadata)
  }

  func testAnIdleScreenRetainsItsCaptureDurationAndVideoFrames() async throws {
    let (url, metadata) = try await record(audio: false)
    XCTAssertEqual(metadata.width, 100); XCTAssertEqual(metadata.height, 200)
    XCTAssertGreaterThanOrEqual(metadata.durationMs, 400)
    let asset = AVURLAsset(url: url)
    let duration = try await asset.load(.duration)
    XCTAssertGreaterThanOrEqual(CMTimeGetSeconds(duration), 0.4)
    let videoTracks = try await asset.loadTracks(withMediaType: .video)
    let track = try XCTUnwrap(videoTracks.first)
    let reader = try AVAssetReader(asset: asset)
    let frames = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]); reader.add(frames)
    XCTAssertTrue(reader.startReading()); var count = 0; var previous: Double?
    while let sample = frames.copyNextSampleBuffer() {
      let pts = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
      if let previous { XCTAssertLessThanOrEqual(pts - previous, 0.1) }
      else { XCTAssertEqual(pts, 0, accuracy: 0.001) }
      previous = pts; count += 1
    }
    XCTAssertEqual(reader.status, .completed); XCTAssertGreaterThanOrEqual(count, 12)
  }

  func testSystemSoundAndVoiceoverBecomeOneAudibleAudioTrack() async throws {
    let (url, _) = try await record(audio: true)
    let separate = try await AVURLAsset(url: url).loadTracks(withMediaType: .audio)
    XCTAssertEqual(separate.count, 2)
    try await blendCaptureAudio(file: url, isCurrent: { XCTAssertTrue(Thread.isMainThread); return true })
    let asset = AVURLAsset(url: url)
    let tracks = try await asset.loadTracks(withMediaType: .audio)
    XCTAssertEqual(tracks.count, 1)
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: try XCTUnwrap(tracks.first), outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 48_000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false]); reader.add(output)
    XCTAssertTrue(reader.startReading()); var bytes: [UInt8] = []
    while let sample = output.copyNextSampleBuffer(), let block = CMSampleBufferGetDataBuffer(sample) {
      var data = [UInt8](repeating: 0, count: CMBlockBufferGetDataLength(block))
      let length = data.count
      data.withUnsafeMutableBytes { buffer in XCTAssertEqual(CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: buffer.baseAddress!), noErr) }
      bytes.append(contentsOf: data)
    }
    XCTAssertEqual(reader.status, .completed)
    let samples = stride(from: 0, to: bytes.count - 1, by: 2).map { Double(Int16(bitPattern: UInt16(bytes[$0]) | UInt16(bytes[$0 + 1]) << 8)) / 32768.0 }
    XCTAssertGreaterThan(samples.count, 9600)
    for frequency in [440.0, 880.0] {
      let cosine = samples.enumerated().reduce(0.0) { $0 + $1.element * cos(2 * Double.pi * frequency * Double($1.offset) / 48_000) }
      let sine = samples.enumerated().reduce(0.0) { $0 + $1.element * sin(2 * Double.pi * frequency * Double($1.offset) / 48_000) }
      XCTAssertGreaterThan(2 * sqrt(cosine * cosine + sine * sine) / Double(samples.count), 0.08)
    }
  }
}
