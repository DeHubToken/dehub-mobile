import React, { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import ProfileSurface, { PROFILE_OPEN_MS } from './ProfileSurface';
import RouteLoadingShell from '../../navigation/RouteLoadingShell';

export interface UserProfileBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenComplete?: () => void;
  usernameOrAddress?: string | null;
  initialHeightPct?: number;
  embedded?: boolean;
}

let ProfileContent: ComponentType<UserProfileBottomSheetProps> | undefined;
function content() {
  return ProfileContent ??= require('./UserProfilePageContent').default;
}

/** Paint and move the light page before evaluating the profile's feed and hooks. */
export default function UserProfileBottomSheet(props: UserProfileBottomSheetProps) {
  const { visible, usernameOrAddress, embedded, onClose, onOpenComplete } = props;
  const [readyIdentifier, setReadyIdentifier] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const complete = useCallback(() => {
    if (!visibleRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setReadyIdentifier(usernameOrAddress ?? null);
    onOpenComplete?.();
  }, [usernameOrAddress, onOpenComplete]);
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
  const Content = ready ? content() : null;
  if (embedded) return Content ? <Content {...props} /> : null;
  return <ProfileSurface visible={visible} onClose={onClose} onOpenComplete={complete}>
    {Content ? <Content {...props} /> : visible || usernameOrAddress ? <RouteLoadingShell profile onBack={onClose} /> : null}
  </ProfileSurface>;
}
