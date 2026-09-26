require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'NowPlaying'
  s.version        = package['version']
  s.summary        = 'Lock-screen Now Playing controls for Tuneable'
  s.description    = 'Publishes MPNowPlayingInfoCenter metadata while expo-av plays audio.'
  s.license        = 'UNLICENSED'
  s.author         = 'Tuneable'
  s.homepage       = 'https://tuneable.stream'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Mostlymisguided/Tuneable.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MediaPlayer'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.source_files = '**/*.{h,m,swift}'
end
