import { useContext, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { VideoPlayer } from 'expo-video';
import { UserContext } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { withWalletHeader } from '../libs/supabase-wallet-client';
import { createDubTipClaim, foreignDubLanguage, replayFor } from '../libs/dub-discovery';
import { getDubSettings } from './useVideoDub';
import { toastInfo } from '../libs/toast';

const showTip = createDubTipClaim(async wallet => {
  const { data, error } = await withWalletHeader(supabase.rpc('claim_video_dub_tip'), wallet);
  return !error && data === true;
});

export function useDubDiscovery(player: VideoPlayer | null, videoId: string | null,
  source: string, target: string | undefined, available: boolean, dubOn: boolean, openSettings: () => void) {
  const user = useContext(UserContext)?.user;
  const wallet = (user?.address || user?.walletAddress)?.toLowerCase();
  const { t } = useTranslation();
  const eligible = !!wallet && !!videoId && available && !dubOn && foreignDubLanguage(source, target);
  const latest = useRef({ eligible, wallet, openSettings });
  latest.current = { eligible, wallet, openSettings };
  useEffect(() => {
    if (!player || !eligible || !wallet) return;
    let active = true;
    const replay = replayFor(`${wallet}:${videoId}:${source}:${target}`);
    const audible = () => player.playing && !player.muted && player.volume > 0;
    const current = () => active && latest.current.eligible && latest.current.wallet === wallet && !getDubSettings().on && audible();
    const sample = () => {
      if (!replay.sample(player.currentTime, player.duration, audible(), Date.now(), player.playbackRate)) return;
      void showTip(wallet, () => toastInfo(t('dub.menuDesc'), {
        duration: 8000,
        actionLabel: t('dub.dubbed'),
        onActionPress: () => {
          if (active && latest.current.eligible && latest.current.wallet === wallet) latest.current.openSettings();
        },
      }), current);
    };
    sample();
    const events = ['timeUpdate', 'playingChange', 'mutedChange', 'volumeChange', 'playToEnd'] as const;
    const subscriptions = events.map(event => player.addListener(event, sample));
    return () => { active = false; subscriptions.forEach(subscription => subscription.remove()); replay.detach(); };
  }, [player, videoId, source, target, eligible, wallet, t]);
}
