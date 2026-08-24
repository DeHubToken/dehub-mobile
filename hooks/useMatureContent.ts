/**
 * Mature content setting — mirrors web's `useMatureContent`
 * (dehubweb src/hooks/use-mature-content.ts).
 *
 * One account-level preference, read by the feed cards and written by the
 * Content settings panel. The server already keeps mature posts out of the
 * public feeds unless this is on, so the client half is about the surfaces
 * where a mature post is still served on purpose — a profile, the Following
 * feed, a shared link. There it renders behind a content warning until the
 * reader taps through, or not at all if they have opted in.
 *
 * Account-level rather than device-local (unlike everything else in
 * `useAppPrefs`): it decides what the API sends, so it has to live where the
 * API can read it, and it follows the reader onto web and onto a new phone.
 */
import { useCallback, useState } from 'react';
import { useUser, useAuthActions } from '../context/AuthContext';
import { AuthService } from '../services/auth.service';
import { toastError } from '../libs';
import { createLogger } from '../libs/logger';

const logger = createLogger('useMatureContent');

export function useMatureContent() {
  const user = useUser() as any;
  const { patchUser } = useAuthActions() as any;
  const [saving, setSaving] = useState(false);

  const showMatureContent = user?.showMatureContent === true;

  const setShowMatureContent = useCallback(
    async (enabled: boolean) => {
      setSaving(true);
      try {
        // Patched locally first so the switch and every mounted card react at
        // once; the feeds themselves are filtered server-side, so what is
        // already loaded keeps whatever the request that fetched it asked for
        // until the next refresh.
        await patchUser({ showMatureContent: enabled });
        await AuthService.updateProfile({ showMatureContent: enabled });
      } catch (error) {
        logger.error('Failed to update mature content setting', error);
        await patchUser({ showMatureContent: !enabled }).catch(() => {});
        toastError(error, 'Could not save that. Try again.');
      } finally {
        setSaving(false);
      }
    },
    [patchUser],
  );

  return { showMatureContent, setShowMatureContent, saving };
}
