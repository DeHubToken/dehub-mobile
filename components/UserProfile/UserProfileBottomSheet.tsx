import { usePerfProbe } from "../../libs/perfTrace";
import React, { memo, useCallback, useDeferredValue, useEffect, useRef, useState, type ComponentType } from 'react';
import ProfileSurface, { PROFILE_OPEN_MS } from './ProfileSurface';
import { Platform, StyleSheet, View } from 'react-native';
import RouteLoadingShell from '../../navigation/RouteLoadingShell';
import StandaloneTabBar from '../../navigation/StandaloneTabBar';

export interface UserProfileBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenComplete?: () => void;
  /** Android: the closing page is fully gone, so its content can be dropped. */
  onCloseComplete?: () => void;
  usernameOrAddress?: string | null;
  initialHeightPct?: number;
  embedded?: boolean;
}

let ProfileContent: ComponentType<UserProfileBottomSheetProps> | undefined;
function content() {
  // Memoised so a render that changes nothing the page reads skips it (see contentVisible).
  return ProfileContent ??= memo(require('./UserProfilePageContent').default);
}

/** Paint and move the light page before evaluating the profile's feed and hooks. */
export default function UserProfileBottomSheet(props: UserProfileBottomSheetProps) {
  usePerfProbe("ProfileSheet");
  const { visible, usernameOrAddress, embedded, onClose, onOpenComplete, onCloseComplete } = props;
  const [readyIdentifier, setReadyIdentifier] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const completion = useRef({ usernameOrAddress, onOpenComplete });
  completion.current = { usernameOrAddress, onOpenComplete };
  const complete = useCallback(() => {
    if (!visibleRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setReadyIdentifier(completion.current.usernameOrAddress ?? null);
    completion.current.onOpenComplete?.();
  }, []);
  useEffect(() => {
    if (!usernameOrAddress) setReadyIdentifier(null);
    if (!visible || embedded) return;
    // Covers an interrupted/missing native event and replacing an already-open
    // profile. Closing before this fires cancels the deferred mount.
    timer.current = setTimeout(complete, PROFILE_OPEN_MS + 100);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [visible, embedded, usernameOrAddress, complete]);

  const ready = !!usernameOrAddress && (embedded || readyIdentifier === usernameOrAddress);
  // The page follows `visible` one render later. Closing re-rendered the whole
  // page (~80ms on a Galaxy S24+) before the close animation could start; now
  // the animation starts at once and the page catches up while it runs.
  const contentVisible = useDeferredValue(visible);
  const Content = ready ? content() : null;
  // The profile brings its own bottom bar, but only once it has built. Until
  // then the opening page covered the bar underneath, so the bar blinked out
  // for ~0.4s on every profile open. Hold one in place until the page's own
  // takes over. On Android it sits over the fading page so it never moves;
  // the iPhone sheet slides it in with the page.
  const holdBar = visible && !Content;
  // On Android the held bar joins one render after the page's first frame:
  // building it (~50ms on a Galaxy S24+) in the same render held the fade
  // back, and the real bar still shows through the page while it fades in.
  const holdBarLater = useDeferredValue(holdBar);
  if (embedded) return Content ? <Content {...props} /> : null;
  const bar = holdBar && (Platform.OS !== 'android' || holdBarLater) ? (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <StandaloneTabBar onBeforeNavigate={onClose} />
    </View>
  ) : null;
  return <>
    <ProfileSurface visible={visible} onClose={onClose} onOpenComplete={complete} onCloseComplete={onCloseComplete}>
      {Content ? <Content {...props} visible={contentVisible} /> : visible || usernameOrAddress ? <RouteLoadingShell profile onBack={onClose} /> : null}
      {Platform.OS === 'android' ? null : bar}
    </ProfileSurface>
    {Platform.OS === 'android' ? bar : null}
  </>;
}
