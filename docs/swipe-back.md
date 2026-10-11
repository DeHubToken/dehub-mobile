# Mobile swipe back coverage

A one-finger swipe inward from the leading 28px/28pt edge uses the current back action. The direction follows the document/native RTL setting. A 64px/pt drag, or a 28px/pt flick at 650px/pt per second, completes it. Vertical scrolling, reverse motion, multi-touch and cancelled gestures do not complete back. The remainder of the screen retains feed paging, image manipulation and media scrubbing.

## Coverage audited in web and native

| Area | Mobile web | APK |
| --- | --- | --- |
| Feed → creator profile | Shared PageHeader control, including loading/error states and direct-link fallback | Embedded and standalone UserProfileBottomSheet boundary closes the profile and retains the feed |
| Posts, video/audio, live viewing, post info | PageHeader/PageIsland, post-stage controls, immersive video/live controls, feed nav back | App stack screen boundary; visible ScreenHeader overrides route pop |
| Images → collection/grid | HomePage and GlobalFeedNav use their existing back-to-collage action | FeedNavBar registers its local back action; image viewers retain their own pan/pinch gestures |
| Direct/public chats | Existing chat back button | ScreenHeader handler, including keyboard dismissal |
| Communities, follow lists, settings, wallet, governance, stores, work, stats and other detail pages | Shared headers cover pages with back arrows; store/post-info error back controls are also marked | Common stack/tab screen boundary and header registration cover navigation back |
| Local collections and playlists | Profile playlist back, wallet address-copy back | ScreenHeader custom back (including saved collection and wallet subviews) |
| Multi-step forms | Work form, article preview, trade, wallet unlock/recovery, new-conversation fee step, badge lending, campaign detail and custom emoji | Header overrides and GlassModal local back registration |
| Upload, editor, broadcast producer | Swipes only call explicitly marked back controls; no generic history pop | Upload honors submitting/live-upload locks and discard confirmation; editor flushes before returning to design list; producer runs its deliberate end/close action |
| Search/feed filters and feed menu | Existing back controls when displayed | Registered local action closes these before leaving the screen |
| Sheets/dialogs | Only the top visible dialog's marked back can run; no underlying page action | GlassModal has its own gesture root and boundary; non-dismissible or wallet-yielded sheets stay locked |
| Authentication | Existing marked back controls only | Existing auth-stack gestures remain; required profile completion and root-stack switching remain protected |
| Standalone pages | Listener lives in AppContent, so guide/skill and standalone surfaces can use marked back controls | AppNavigator and BottomTabNavigator share the screen boundary |

## Implementation contract

Web mounts one capture-phase touch listener in AppContent. `data-swipe-back` opts a real back button into it; the gesture clicks that button so its fallback, draft handling and local state remain the same as a tap. Hidden, disabled, inert and covered controls are ignored. Touch cancellation and browser popstate abandon the gesture, preventing a second back after native browser navigation. Pages without a back control do not acquire an arbitrary history pop.

APK screens use a gesture-handler boundary restricted to the leading edge. `useSwipeBackAction` registers a local back action; the latest active local registration overrides the stack pop. Independent profile and GlassModal boundaries prevent a swipe from reaching the screen below. Route fallback is limited to an actual stack entry, so a home tab cannot switch into an older auth stack. Existing iOS native-stack gestures are retained without installing a second recognizer.

New web back buttons should carry `data-swipe-back`. Native screens using ScreenHeader or FeedNavBar are covered automatically; custom back buttons should register the same callback with `useSwipeBackAction`. Custom native modals outside GlassModal need their own gesture root/boundary. Embedded third-party app/game navigation remains owned by that app; host back controls can opt in without interpreting horizontal gameplay gestures.

## Verification

Cloud tests exercise completion thresholds, cancellation, scrolling, middle-of-screen swipes, multi-touch, browser back deduplication, hidden/disabled controls, nested dialog isolation, local native callback precedence, callback updates/unregistration and inactive screens. Both repositories run TypeScript and their full existing test suites on GitHub-hosted CI.

Production acceptance: from a feed open a profile, swipe from the leading edge and confirm the feed and scroll position return; repeat for a post, chat, image collection and direct profile URL. A vertical scroll, center-screen feed swipe, scrub or pinch must retain its original behavior. On APK also verify a draft upload opens discard confirmation, an active upload cannot be dismissed, and the editor saves before closing. Publication and device verification are separate from a green PR.
