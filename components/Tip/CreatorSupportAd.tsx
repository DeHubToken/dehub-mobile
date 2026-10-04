import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { supabase } from '../../services/supabase';
import { dehubAuthHeaders } from '../../services/ai.service';
import { useSilenceOnRelease } from '../../hooks/useSilenceOnRelease';
import { supportedWatchDelta } from '../../libs/support-watch';

interface SupportAd { supportSessionId: string; mediaUrl: string; headline: string; advertiser: string; creatorShareUsd: number }

async function invoke(name: string, body: object, wallet: string) {
  const headers = await dehubAuthHeaders(wallet);
  if (!headers['x-dehub-token']) throw new Error('Sign in to support a creator.');
  const { data, error } = await supabase.functions.invoke(name, { body, headers });
  if (error || data?.error) throw new Error(data?.error || 'Creator support is unavailable. Please retry.');
  return data;
}

function SupportVideo({ ad, wallet, onMessage }: { ad: SupportAd; wallet: string; onMessage: (message: string) => void }) {
  const [watched, setWatched] = useState(0);
  const [credited, setCredited] = useState(false);
  const box = useRef<View>(null);
  const { height } = useWindowDimensions();
  const progress = useRef({ media: 0, at: Date.now(), played: 0, sent: 0, pending: false });
  const player = useVideoPlayer(ad.mediaUrl, instance => {
    instance.muted = true; instance.timeUpdateEventInterval = 0.5; instance.play();
  });
  useSilenceOnRelease(player);
  useEffect(() => {
    const background = AppState.addEventListener('change', state => {
      progress.current.at = Date.now();
      if (state !== 'active') { try { player.pause(); } catch {} }
    });
    const listener = player.addListener('timeUpdate', ({ currentTime }) => {
      const p = progress.current;
      const now = Date.now();
      const elapsed = (now - p.at) / 1000;
      const delta = currentTime - p.media;
      p.media = currentTime; p.at = now;
      if (credited || !player.playing || AppState.currentState !== 'active') return;
      box.current?.measureInWindow((_x, y, _width, h) => {
        if (!h || Math.max(0, Math.min(height, y + h) - Math.max(0, y)) < h / 2) {
          try { player.pause(); } catch {} return;
        }
        p.played = Math.min(60, p.played + supportedWatchDelta(delta, elapsed, player.playing, AppState.currentState === 'active'));
        if (p.pending || p.played - p.sent < 4) return;
        p.pending = true; p.sent = p.played;
        void invoke('ads-creator-support', { sessionId: ad.supportSessionId, playedSeconds: p.played }, wallet)
          .then(data => {
            setWatched(Number(data.watchedSeconds || 0));
            if (data.credited) {
              player.pause(); setCredited(true);
              onMessage(`$${Number(data.creatorShareUsd).toFixed(4)} added to the creator's ad revenue. DHB settlement is pending.`);
            }
          })
          .catch(error => { p.sent = Math.max(0, p.sent - 4); try { player.pause(); } catch {} onMessage(error.message); })
          .finally(() => { p.pending = false; });
      });
    });
    return () => { background.remove(); listener.remove(); };
  }, [ad, wallet, player, credited, height, onMessage]);
  return <View ref={box} collapsable={false} style={{ gap: 8 }}>
    <Text style={{ color: '#fff', fontSize: 13 }}>Sponsored by {ad.advertiser} · {ad.headline}</Text>
    <VideoView player={player} nativeControls contentFit="contain" style={{ height: 180, width: '100%', borderRadius: 10 }} />
    <Text style={{ color: '#A6A9AC', fontSize: 12 }}>{Math.floor(watched)} / 30 seconds verified · Creator share ${ad.creatorShareUsd.toFixed(4)}</Text>
  </View>;
}

export default function CreatorSupportAd({ postId, wallet }: { postId: number; wallet: string }) {
  const [ad, setAd] = useState<SupportAd | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const start = async () => {
    setLoading(true); setMessage('');
    try {
      const data = await invoke('ads-serve', { supportPostId: String(postId), count: 1 }, wallet);
      const next = data?.ads?.[0];
      if (!next?.supportSessionId || !next.mediaUrl) {
        setMessage('No sponsor videos are available right now. You can still send a DHB tip.'); return;
      }
      setAd(next);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load an ad.'); }
    finally { setLoading(false); }
  };
  return <View style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 16 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Watch an ad to support this creator" disabled={loading || !!ad} onPress={start} style={{ padding: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' }}>
      <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600' }}>{loading ? 'Finding a sponsor…' : 'Watch an ad to support this creator'}</Text>
    </Pressable>
    <Text style={{ color: '#A6A9AC', fontSize: 12 }}>Watch 30 seconds. The sponsor funds the creator's revenue share; you pay nothing.</Text>
    {ad ? <>
      <SupportVideo ad={ad} wallet={wallet} onMessage={setMessage} />
      <Pressable accessibilityRole="button" accessibilityLabel="Close ad" onPress={() => setAd(null)} style={{ padding: 8 }}><Text style={{ color: '#fff', textAlign: 'center' }}>Close ad</Text></Pressable>
    </> : null}
    {message ? <Text accessibilityRole="alert" style={{ color: '#fff', fontSize: 13 }}>{message}</Text> : null}
  </View>;
}
