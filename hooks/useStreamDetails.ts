import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import { AppState } from 'react-native';
import { getLiveStream, getStreamKey, LiveStreamEntity } from '../services/live.service';
import { streamRefreshInterval } from '../libs/live-status';

export interface UseStreamDetailsResult {
  streamEntity: LiveStreamEntity | null;
  streamLoading: boolean;
  streamError: string | null;
  streamKeyValue: string | null;
  streamKeyLoading: boolean;
  streamKeyError: string | null;
  refetchStream: (background?: boolean) => void;
  refetchStreamKey: () => void;
}

export const useStreamDetails = (streamId?: string, fetchKey: boolean = true): UseStreamDetailsResult => {
  const { t: _copy } = _useCopy();
  const [streamEntity, setStreamEntity] = useState<LiveStreamEntity | null>(null);
  const [streamLoading, setStreamLoading] = useState<boolean>(!!streamId);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamKeyValue, setStreamKeyValue] = useState<string | null>(null);
  const [streamKeyLoading, setStreamKeyLoading] = useState<boolean>(false);
  const [streamKeyError, setStreamKeyError] = useState<string | null>(null);
  const generation = useRef(0);
  // Consecutive failed reads. A failed read is not an answer about the stream,
  // so the viewer keeps trying instead of settling on whatever it showed last.
  const [failures, setFailures] = useState(0);

  const fetchStream = useCallback((background = false) => {
    if (!streamId) return;
    const requestGeneration = generation.current;
    if (!background) setStreamLoading(true);
    setStreamError(null);
    getLiveStream(streamId)
      .then((res: any) => {
        if (requestGeneration !== generation.current) return;
        const entity: any = res?.result || res;
        // An empty body is a failed read too; never trade a stream we have for nothing.
        if (entity) { setStreamEntity(entity); setFailures(0); } else setFailures((n) => n + 1);
      })
      .catch((e: any) => {
        if (requestGeneration !== generation.current) return;
        setFailures((n) => n + 1);
        setStreamError(e?.message || _copy("copy.9dca8ee026ff", { defaultValue: "Failed to load stream" }));
      })
      .finally(() => { if (requestGeneration === generation.current) setStreamLoading(false); });
  }, [streamId, _copy]);

  const fetchStreamKey = () => {
    if (!streamId || !fetchKey) return;
    const requestGeneration = generation.current;
    setStreamKeyLoading(true);
    setStreamKeyError(null);
    getStreamKey(streamId)
      .then((res: any) => {
        if (requestGeneration !== generation.current) return;
        const key = res?.streamKey || res?.result?.streamKey || res?.data?.streamKey;
        if (key) setStreamKeyValue(key); else setStreamKeyError(_copy("copy.4fda56391dfb", { defaultValue: "No key returned" }));
      })
      .catch((e: any) => {
        if (requestGeneration !== generation.current) return;
        setStreamKeyError(e?.message || _copy("copy.cbda24306ce8", { defaultValue: "Failed to fetch key" }));
      })
      .finally(() => { if (requestGeneration === generation.current) setStreamKeyLoading(false); });
  };

  useEffect(() => {
    generation.current += 1;
    setStreamEntity(null);
    setStreamKeyValue(null);
    setStreamKeyLoading(false);
    setStreamKeyError(null);
    setStreamLoading(!!streamId);
    setStreamError(null);
    setFailures(0);
    if (!streamId) return;
    fetchStream();
    if (fetchKey) fetchStreamKey();
    return () => { generation.current += 1; };
  }, [streamId, fetchKey]);

  useEffect(() => {
    if (!streamId || fetchKey) return;
    const delay = streamRefreshInterval(streamEntity);
    if (!delay) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') fetchStream(true);
    }, delay);
    return () => clearInterval(timer);
  }, [streamId, streamEntity, fetchKey, fetchStream]);

  // Retry a failed read: 2s, 4s, 8s, then every 15s.
  useEffect(() => {
    if (!streamId || fetchKey || failures === 0) return;
    const timer = setTimeout(() => {
      if (AppState.currentState === 'active') fetchStream(true);
      else setFailures((n) => n + 1);
    }, Math.min(15_000, 1_000 * 2 ** failures));
    return () => clearTimeout(timer);
  }, [streamId, fetchKey, failures, fetchStream]);

  // Coming back to the app, the answer from before it slept is stale.
  useEffect(() => {
    if (!streamId || fetchKey) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchStream(true);
    });
    return () => sub.remove();
  }, [streamId, fetchKey, fetchStream]);

  return {
    streamEntity,
    streamLoading,
    streamError,
    streamKeyValue,
    streamKeyLoading,
    streamKeyError,
    refetchStream: fetchStream,
    refetchStreamKey: fetchStreamKey,
  };
};
