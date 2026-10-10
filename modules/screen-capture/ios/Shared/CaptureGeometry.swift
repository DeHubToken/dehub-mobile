import Foundation

struct CaptureCanvas: Equatable {
  let width: Int
  let height: Int
}

func captureCanvas(width: Int, height: Int) -> CaptureCanvas {
  let ratio = min(1.0, 1920.0 / Double(max(2, max(width, height))))
  return CaptureCanvas(width: max(2, Int(Double(max(2, width)) * ratio) / 2 * 2), height: max(2, Int(Double(max(2, height)) * ratio) / 2 * 2))
}

func fittedCaptureRect(source: CGSize, canvas: CaptureCanvas) -> CGRect {
  guard source.width.isFinite, source.height.isFinite, source.width > 0, source.height > 0 else { return .zero }
  let ratio = min(CGFloat(canvas.width) / source.width, CGFloat(canvas.height) / source.height)
  let width = min(CGFloat(canvas.width), source.width * ratio)
  let height = min(CGFloat(canvas.height), source.height * ratio)
  return CGRect(x: (CGFloat(canvas.width) - width) / 2, y: (CGFloat(canvas.height) - height) / 2, width: width, height: height)
}
