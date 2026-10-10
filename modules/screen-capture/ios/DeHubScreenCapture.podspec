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
  s.weak_frameworks = 'ScreenCaptureKit'
end
