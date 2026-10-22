internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // Camera looks have to exist in ProcessorProvider before the broadcaster
    // ever names one — react-native-webrtc resolves them by name at capture
    // time and silently drops anything it cannot find.
    DHBVideoLooks.registerAll()

    // The window is created, and React Native started, by SceneDelegate below.
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

/**
 The scene-based life cycle. Apps built with the iOS 27 SDK abort at launch
 without it, and it is what lets the window follow iPhone Duo folding and
 iPad resizing. Expo only ships this as ExpoAppSceneDelegate from SDK 57;
 ExpoAppDelegate is unchanged between SDK 55 and 57, so this is that class
 and its SceneEventForwarder, ported as they are.

 UIKit no longer calls the app delegate's URL, user-activity, life-cycle and
 quick-action methods under scenes, so each is re-fed to AppDelegate, which
 forwards to every Expo subscriber as before.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private let forwarder = SceneEventForwarder()

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      return
    }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory else {
      fatalError("SceneDelegate needs AppDelegate to create the React Native factory in didFinishLaunching.")
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Code that reads UIApplication.shared.delegate?.window (expo-system-ui)
    // keeps finding it.
    appDelegate.window = window

    // A cold-start link arrives in connectionOptions, not in launch options,
    // and Linking.getInitialURL() only reads launch options.
    let browsingWebActivity = connectionOptions.userActivities.first {
      $0.activityType == NSUserActivityTypeBrowsingWeb
    }
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: Self.launchOptions(
        url: connectionOptions.urlContexts.first?.url,
        userActivity: browsingWebActivity
      )
    )

    connectionOptions.urlContexts.forEach {
      forwarder.open(url: $0.url, options: Self.openURLOptions(from: $0.options))
    }
    connectionOptions.userActivities.forEach { forwarder.continue($0) }

    // A quick action that cold-starts the app arrives here instead of in
    // windowScene(_:performActionFor:completionHandler:).
    if let shortcutItem = connectionOptions.shortcutItem {
      forwarder.perform(shortcutItem) { _ in }
    }
  }

  func sceneDidDisconnect(_ scene: UIScene) {
    window = nil
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    forwarder.didBecomeActive()
  }

  func sceneWillResignActive(_ scene: UIScene) {
    forwarder.willResignActive()
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    forwarder.willEnterForeground()
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    forwarder.didEnterBackground()
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    URLContexts.forEach { forwarder.open(url: $0.url, options: Self.openURLOptions(from: $0.options)) }
  }

  func scene(_ scene: UIScene, willContinueUserActivityWithType userActivityType: String) {
    forwarder.willContinueUserActivity(withType: userActivityType)
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    forwarder.continue(userActivity)
  }

  func scene(
    _ scene: UIScene,
    didFailToContinueUserActivityWithType userActivityType: String,
    error: Error
  ) {
    forwarder.didFailToContinueUserActivity(withType: userActivityType, error: error)
  }

  func scene(_ scene: UIScene, didUpdate userActivity: NSUserActivity) {
    forwarder.didUpdate(userActivity)
  }

  func windowScene(
    _ windowScene: UIWindowScene,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    forwarder.perform(shortcutItem, completionHandler: completionHandler)
  }

  /// The launch options Linking.getInitialURL() reads, rebuilt from the
  /// scene's connection options; nil when no link started the app. Keys are
  /// built from their raw strings because the UIApplication accessors are
  /// deprecated from iOS 26, while React Native still reads these keys.
  static func launchOptions(
    url: URL?,
    userActivity: NSUserActivity?
  ) -> [UIApplication.LaunchOptionsKey: Any]? {
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url {
      launchOptions[UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsURLKey")] = url
    }
    if let userActivity {
      launchOptions[UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsUserActivityDictionaryKey")] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": userActivity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": userActivity
      ]
    }
    return launchOptions.isEmpty ? nil : launchOptions
  }

  private static func openURLOptions(
    from sceneOptions: UIScene.OpenURLOptions
  ) -> [UIApplication.OpenURLOptionsKey: Any] {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    if let sourceApplication = sceneOptions.sourceApplication {
      options[.sourceApplication] = sourceApplication
    }
    if let annotation = sceneOptions.annotation {
      options[.annotation] = annotation
    }
    options[.openInPlace] = sceneOptions.openInPlace
    return options
  }
}

/// Re-feeds scene events to AppDelegate (and through it every Expo subscriber).
@MainActor
private struct SceneEventForwarder {
  var appDelegate: () -> ExpoAppDelegate? = { UIApplication.shared.delegate as? ExpoAppDelegate }

  func open(url: URL, options: [UIApplication.OpenURLOptionsKey: Any]) {
    let application = UIApplication.shared
    let delegate = appDelegate()
    notifyLinkingManagerUnlessAlreadyNotified(of: url) {
      _ = delegate?.application(application, open: url, options: options)
    } notify: {
      RCTLinkingManager.application(application, open: url, options: options)
    }
  }

  func `continue`(_ userActivity: NSUserActivity) {
    let application = UIApplication.shared
    let delegate = appDelegate()
    notifyLinkingManagerUnlessAlreadyNotified(of: userActivity.webpageURL) {
      _ = delegate?.application(application, continue: userActivity, restorationHandler: { _ in })
    } notify: {
      RCTLinkingManager.application(application, continue: userActivity, restorationHandler: { _ in })
    }
  }

  func willContinueUserActivity(withType userActivityType: String) {
    _ = appDelegate()?.application(UIApplication.shared, willContinueUserActivityWithType: userActivityType)
  }

  func didFailToContinueUserActivity(withType userActivityType: String, error: Error) {
    appDelegate()?.application(UIApplication.shared, didFailToContinueUserActivityWithType: userActivityType, error: error)
  }

  func didUpdate(_ userActivity: NSUserActivity) {
    appDelegate()?.application(UIApplication.shared, didUpdate: userActivity)
  }

  func didBecomeActive() {
    appDelegate()?.applicationDidBecomeActive(UIApplication.shared)
  }

  func willResignActive() {
    appDelegate()?.applicationWillResignActive(UIApplication.shared)
  }

  func willEnterForeground() {
    appDelegate()?.applicationWillEnterForeground(UIApplication.shared)
  }

  func didEnterBackground() {
    appDelegate()?.applicationDidEnterBackground(UIApplication.shared)
  }

  /// UIKit waits on completionHandler, so it runs exactly once.
  func perform(_ shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
    guard let delegate = appDelegate() else {
      completionHandler(false)
      return
    }
    delegate.application(UIApplication.shared, performActionFor: shortcutItem, completionHandler: completionHandler)
  }

  /// Runs body, then notify unless RCTLinkingManager already announced url
  /// while body ran: AppDelegate's own overrides above call it themselves, and
  /// the JS url event must arrive once.
  private func notifyLinkingManagerUnlessAlreadyNotified(of url: URL?, during body: () -> Void, notify: () -> Void) {
    guard let url else {
      body()
      notify()
      return
    }
    let observer = LinkingManagerObserver(url: url)
    body()
    if !observer.wasNotified {
      notify()
    }
  }
}

/// Watches the notification RCTLinkingManager posts for every link it handles
/// (the name is private to React Native; expo-router spells it out the same way).
private final class LinkingManagerObserver: NSObject {
  private let expectedURL: String
  private(set) var wasNotified = false

  init(url: URL) {
    expectedURL = url.absoluteString
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(linkingManagerDidOpenURL(_:)),
      name: Notification.Name("RCTOpenURLNotification"),
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  @objc
  private func linkingManagerDidOpenURL(_ notification: Notification) {
    wasNotified = wasNotified || notification.userInfo?["url"] as? String == expectedURL
  }
}
