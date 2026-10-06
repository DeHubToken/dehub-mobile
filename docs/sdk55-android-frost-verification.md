# Expo 55 Android frost preview

This preview upgrades Expo 54 to 55 and React Native 0.81 to 0.83. Navigation
pill dimensions, icons, gestures and placement stay the same. Android 12 and
newer use the supported RenderNode blur path; older Android devices retain an
opaque fallback. Light and Minimal navigation retain their existing treatment.

The home feed is a separate blur target, rendered before its header. Navigation
pills sample that target. Controls contained inside the target sample the
separate theme backdrop instead, preventing recursive drawing. Other screens
use the theme backdrop until they register a separate content target.

The preview runtime is `sdk55-frost-1`, distinct from existing SDK 54 binaries.
It must be installed as a native build. Do not publish this JavaScript to the
SDK 54 update runtime. The Google Play internal-testing bundle uses the preview
channel and staging locale origin. Production publishing is held until device
checks are complete. Google Play signs the tester update with the existing app
signing certificate, preserving the installed app and its data.

The existing "Internal testers | Team" list is selected in Play Console. Its
join link is https://play.google.com/apps/internaltest/4700504887929249417.
The frost version is not available until the new internal release is active.

## Migration checks

- Dependencies aligned on a GitHub-hosted runner; FlashList 2.3.2 retained.
- Legacy audio playback/recording moved from expo-av to expo-audio.
- Video fullscreen props updated to the supported API.
- Android host and Hermes compiler path updated from the Expo 55 native template.
- iOS Podfile and AppDelegate updated from the same native template. The lockfile
  was resolved on a GitHub-hosted macOS runner; full compilation remains pending.
- Livepeer client/query context uses the supported core-react exports. The unused
  native player package was removed because its barrel imports retired expo-av.
- Audio/video task-dismissal fixes rebased onto SDK 55 packages.
- SDK 55 audio binds a normally started service, replacing the older foreground
  start/pending-player path. The old service-start patch no longer matches that
  implementation. Notification/background playback still require device checks.
- SDK 55 PiP restoration is keyed by child ID rather than indexing a visibility
  list, superseding the previous bounds-check patch. Enter/exit still needs QA.
- Patch application fails installation when a required patch cannot apply.
- Argon2 keeps its existing native hashing implementation. Its Android build
  uses Maven Central and an explicit namespace for Gradle 9 and current AGP.
- The existing Torus login browser also uses Maven Central and an explicit
  Android namespace; its manifest no longer declares the package attribute.
- Cloud JavaScript bundling and Android/iOS native compilation must pass before
  the signed bundle build and internal-track submission begin.

## Release gate

| Area | Required verification | State |
| --- | --- | --- |
| Cloud | Typecheck, existing tests, patch application, JavaScript bundle, Android/iOS compile, signed AAB build | Prior typecheck and tests passed; prior builds failed on Torus Gradle, Livepeer expo-av and Expo Swift import compatibility; fixes await cloud checks |
| Tester release | Google Play internal-track processing and active release version | Pending; existing track still serves 1.17.6 |
| Installation | Install the Play tester update; preserve existing app data | Pending |
| Startup | Cold/warm launch, background/resume, crash and ANR logs | Pending |
| Feed | All six tabs, fast scroll, pagination, refresh, filters, pager drags | Pending |
| Chrome | Top/bottom pills, theme changes, drawers, overlays, back navigation | Pending |
| Media | Images, video, fullscreen, PiP, audio play/pause/seek and lock-screen controls | Pending |
| Recording | Microphone permission, record/preview/cancel without publishing | Pending |
| Forms | Composer and messaging keyboard/insets, draft retention | Pending |
| Account | Existing session, wallet/account screens and payment form loading | Pending |
| Streaming | Viewer playback and call/broadcast setup without contacting others | Pending |
| Web | Matching material at staging.dehub.io, desktop and phone widths | Pending |

No production charge, transfer, post, message or outgoing call is required for
this regression pass. Transaction completion and multi-device call quality are
separate checks and must not be reported as verified by this pass.
