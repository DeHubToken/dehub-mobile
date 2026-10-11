import XCTest
@testable import CaptureRecovery

final class CaptureGeometryTests: XCTestCase {
  func testPhoneCanvasIsEvenAndBounded() {
    XCTAssertEqual(captureCanvas(width: 1440, height: 2560), CaptureCanvas(width: 1080, height: 1920))
    let odd = captureCanvas(width: 1081, height: 1921)
    XCTAssertEqual(odd.width % 2, 0); XCTAssertEqual(odd.height % 2, 0)
    XCTAssertLessThanOrEqual(odd.height, 1920)
  }
  func testRotationFitsTheOriginalPhoneCanvasWithoutCropping() {
    let fit = fittedCaptureRect(source: CGSize(width: 1920, height: 1080), canvas: CaptureCanvas(width: 1080, height: 1920))
    XCTAssertEqual(fit.width, 1080); XCTAssertEqual(fit.height, 607.5)
    XCTAssertEqual(fit.minX, 0); XCTAssertEqual(fit.minY, 656.25)
  }
  func testPhoneContentFitsAFormerLandscapeCanvas() {
    let fit = fittedCaptureRect(source: CGSize(width: 1080, height: 1920), canvas: CaptureCanvas(width: 1920, height: 1080))
    XCTAssertEqual(fit.height, 1080); XCTAssertEqual(fit.width, 607.5)
    XCTAssertEqual(fit.minX, 656.25); XCTAssertEqual(fit.minY, 0)
  }
  func testOddAppWindowDimensionsRetainTheirAspectRatio() {
    let fit = fittedCaptureRect(source: CGSize(width: 411, height: 733), canvas: CaptureCanvas(width: 1080, height: 1920))
    XCTAssertEqual(fit.width / fit.height, 411.0 / 733.0, accuracy: 0.000001)
    XCTAssertGreaterThanOrEqual(fit.minX, 0); XCTAssertGreaterThanOrEqual(fit.minY, 0)
    XCTAssertLessThanOrEqual(fit.maxX, 1080); XCTAssertLessThanOrEqual(fit.maxY, 1920)
  }
}
