import ReplayKit
import UIKit

final class CaptureSetupViewController: UIViewController {
  private var ledger: CaptureLedger?
  private var original: CaptureTicket?
  private var finished = false

  override func viewDidLoad() {
    super.viewDidLoad()
    // Bind once. An old consent screen can never consume a newer editor take.
    ledger = try? CaptureLedger(); original = try? ledger?.pendingConsent()
    view.backgroundColor = .systemBackground
    let stack = UIStackView(); stack.axis = .vertical; stack.spacing = 24
    stack.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(stack)
    let heading = UILabel(); heading.text = original?.title ?? Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
    heading.font = .preferredFont(forTextStyle: .headline); heading.textAlignment = .center; heading.numberOfLines = 0
    let start = UIButton(type: .system); start.setTitle(original?.title, for: .normal)
    start.addTarget(self, action: #selector(begin), for: .touchUpInside); start.isEnabled = original != nil
    let cancel = UIButton(type: .system); cancel.setTitle(original?.cancelLabel, for: .normal)
    cancel.addTarget(self, action: #selector(decline), for: .touchUpInside)
    [heading, start, cancel].forEach { stack.addArrangedSubview($0) }
    NSLayoutConstraint.activate([stack.centerYAnchor.constraint(equalTo: view.centerYAnchor), stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24)])
    if original == nil { decline() }
  }

  @objc private func begin() {
    guard !finished, let original, let ledger,
      let current = try? ledger.ticket(original.sessionId, scopeKey: original.scopeKey),
      current == original, current.state == .pending, !current.cancelRequested,
      let file = try? ledger.recordingURL(original.sessionId) else { decline(); return }
    finished = true
    extensionContext?.completeRequest(withBroadcast: file, setupInfo: [
      "sessionId": original.sessionId as NSString, "scopeKey": original.scopeKey as NSString,
      "hostInstanceId": original.hostInstanceId as NSString,
    ])
  }
  @objc private func decline() {
    guard !finished else { return }; finished = true
    extensionContext?.cancelRequest(withError: NSError(domain: "io.dehub.screen-capture", code: 1, userInfo: [NSLocalizedDescriptionKey: original?.cancelLabel ?? "DeHub"]))
  }
}
