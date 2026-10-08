import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { dubLanguage, hasCachedDubLanguage } from '../libs/cached-dub-languages';

type CachedDub = { status: string; audioUrl?: string };
const PROVIDER = 'chatterbox-multilingual-v3';

/** One shared render per video/language. Realtime supplies completion, with no polling. */
export function useCachedVideoDub(transcriptId: string | null, language: string | null, enabled: boolean) {
  const lang = dubLanguage(language);
  const active = enabled && !!transcriptId && hasCachedDubLanguage(lang);
  const client = useQueryClient();
  const key = ['cached-video-dub', transcriptId, lang] as const;
  const read = async (): Promise<CachedDub | null> => {
    const { data, error } = await supabase.from('video_dubs').select('status, audio_url, provider')
      .eq('transcript_id', transcriptId!).eq('language', lang).maybeSingle();
    if (error) throw error;
    return data?.provider === PROVIDER ? { status: data.status, audioUrl: data.status === 'ready' ? data.audio_url ?? undefined : undefined } : null;
  };
  const query = useQuery<CachedDub>({
    queryKey: key, enabled: active, staleTime: 5 * 60 * 1000, retry: false,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async () => {
      const cached = await read();
      if (cached?.status === 'ready') return cached;
      const { data, error } = await supabase.functions.invoke('auto-dub', { body: { action: 'request', transcriptId, lang } });
      if (error) return { status: 'unavailable' };
      return { status: data?.status ?? 'unavailable', audioUrl: data?.status === 'ready' ? data.audioUrl : undefined };
    },
  });
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const channel = supabase.channel(`cached-dub:${transcriptId}:${lang}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'video_dubs', filter: `transcript_id=eq.${transcriptId}` }, (event) => {
        const row = event.new as { language?: string; provider?: string; status: string; audio_url?: string };
        if (row.language !== lang || row.provider !== PROVIDER) return;
        client.setQueryData(key, { status: row.status, audioUrl: row.status === 'ready' ? row.audio_url : undefined });
      }).subscribe((status) => {
        // Recover a completion missed while this player was paused/off screen.
        if (status === 'SUBSCRIBED') void read().then((row) => {
          if (alive && row?.status === 'ready') client.setQueryData(key, row);
        }).catch(() => {});
      });
    return () => { alive = false; void supabase.removeChannel(channel); };
    // The identity is the transcript and normalized language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, transcriptId, lang, client]);
  return query.data;
}
