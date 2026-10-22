Pod::Spec.new do |s|
  s.name = 'DeHubScreenCapture'
  s.version = '1.0.0'
  s.summary = 'DeHub editor screen recording'
  s.description = 'System capture, durable recording ownership, and audio blending for the editor.'
  s.author = 'DeHub'
  s.homepage = 'https://dehub.io'
  s.license = { type: 'MIT' }
  s.platform = :ios, '15.1'
  s.source = { git: 'https://github.com/DeHubToken/dehub-mobile.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.swift_version = '5.0'
  s.source_files = '*.swift', 'Shared/*.swift'
  s.frameworks = 'AVFoundation', 'CoreImage', 'CoreMedia', 'ReplayKit', 'UIKit'
  # ScreenCaptureKit is in the iOS 27 device SDK only. Weak-linked on device builds
  # made with that SDK; other builds compile ModernCaptureDriver out and link without it.
  s.user_target_xcconfig = { 'OTHER_LDFLAGS[sdk=iphoneos27*]' => '$(inherited) -weak_framework ScreenCaptureKit' }
end
