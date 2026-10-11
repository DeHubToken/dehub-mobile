require 'xcodeproj'

ios = File.expand_path('../ios', __dir__)
project = Xcodeproj::Project.open(File.join(ios, 'DeHub.xcodeproj'))
app = project.targets.find { |target| target.name == 'DeHub' }
raise 'DeHub application target missing' unless app
group = 'group.io.dehub.mobile.screen-capture'
definitions = {
  'DeHub' => 'io.dehub.mobile',
  'DeHubCaptureSetup' => 'io.dehub.mobile.screen-capture-setup',
  'DeHubCaptureUpload' => 'io.dehub.mobile.screen-capture-upload'
}
definitions.each do |name, identifier|
  matches = project.targets.select { |target| target.name == name }
  raise "Expected one signing target: #{name}" unless matches.length == 1
  target = matches.first
  target.build_configurations.each do |configuration|
    settings = configuration.build_settings
    raise "Wrong bundle identifier: #{name}/#{configuration.name}" unless settings['PRODUCT_BUNDLE_IDENTIFIER'] == identifier
    path = settings.fetch('CODE_SIGN_ENTITLEMENTS')
    entitlements = Xcodeproj::Plist.read_from_path(File.expand_path(path, ios))
    raise "Recording App Group missing: #{name}/#{configuration.name}" unless entitlements.fetch('com.apple.security.application-groups', []).include?(group)
  end
  next if name == 'DeHub'
  raise "Wrong product type: #{name}" unless target.product_type == 'com.apple.product-type.app-extension'
  raise "Application dependency missing: #{name}" unless app.dependencies.any? { |dependency| dependency.target == target }
  copies = app.copy_files_build_phases.select { |phase| phase.dst_subfolder_spec.to_s == '13' }.flat_map(&:files)
  raise "Extension embedding missing or duplicated: #{name}" unless copies.count { |file| file.file_ref == target.product_reference } == 1
end
puts 'All three recording signing targets, dependencies, embedding and App Group entitlements are ready.'
