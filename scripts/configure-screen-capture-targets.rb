require 'xcodeproj'

# Keep extension sources and embedding in the same reviewed configuration as the module.
def configure_screen_capture_targets(ios_directory)
  project_path = File.join(ios_directory, 'DeHub.xcodeproj')
  project = Xcodeproj::Project.open(project_path)
  app = project.targets.find { |target| target.name == 'DeHub' }
  raise 'DeHub application target missing' unless app
  source_group = project.main_group['Screen Capture'] || project.main_group.new_group('Screen Capture')
  embed = app.copy_files_build_phases.find { |phase| phase.name == 'Embed Screen Capture' } || app.new_copy_files_build_phase('Embed Screen Capture')
  embed.dst_subfolder_spec = '13'
  definitions = [
    ['DeHubCaptureSetup', 'io.dehub.mobile.screen-capture-setup', 'BroadcastSetup', ['CaptureLedger.swift', 'BroadcastSetup/CaptureSetupViewController.swift']],
    ['DeHubCaptureUpload', 'io.dehub.mobile.screen-capture-upload', 'BroadcastUpload', ['CaptureLedger.swift', 'Shared/CaptureGeometry.swift', 'Shared/CaptureMovieWriter.swift', 'BroadcastUpload/CaptureSampleHandler.swift']]
  ]
  definitions.each do |name, identifier, folder, sources|
    target = project.targets.find { |item| item.name == name } || project.new_target(:app_extension, name, :ios, '15.1')
    target.build_configurations.each do |configuration|
      app_configuration = app.build_configurations.find { |item| item.name == configuration.name }
      settings = configuration.build_settings
      settings['PRODUCT_BUNDLE_IDENTIFIER'] = identifier
      settings['PRODUCT_NAME'] = name
      settings['SWIFT_VERSION'] = '5.0'
      settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
      settings['TARGETED_DEVICE_FAMILY'] = '1,2'
      settings['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
      settings['SKIP_INSTALL'] = 'YES'
      settings['CODE_SIGN_STYLE'] = 'Automatic'
      settings['DEVELOPMENT_TEAM'] = app_configuration&.build_settings&.fetch('DEVELOPMENT_TEAM', nil)
      settings['CURRENT_PROJECT_VERSION'] = app_configuration&.build_settings&.fetch('CURRENT_PROJECT_VERSION', '1')
      settings['MARKETING_VERSION'] = '1.18.3'
      settings['INFOPLIST_FILE'] = "../modules/screen-capture/ios/#{folder}/Info.plist"
      settings['CODE_SIGN_ENTITLEMENTS'] = '../modules/screen-capture/ios/Capture.entitlements'
      settings['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
    end
    sources.each do |source|
      path = "../modules/screen-capture/ios/#{source}"
      reference = source_group.files.find { |file| file.path == path } || source_group.new_file(path, :SOURCE_ROOT)
      target.source_build_phase.add_file_reference(reference, true)
    end
    unless app.dependencies.any? { |dependency| dependency.target == target }
      app.add_dependency(target)
    end
    copy = embed.files.find { |file| file.file_ref == target.product_reference } || embed.add_file_reference(target.product_reference, true)
    copy.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
  end
  project.save
end

configure_screen_capture_targets(File.expand_path('../ios', __dir__)) if $PROGRAM_NAME == __FILE__
