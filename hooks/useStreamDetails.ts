import { useCallback, useEffect, useRef, useState } from 'react';
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
  refetchStream: () => void;
  refetchStreamKey: () => void;
}

export const useStreamDetails = (streamId?: string, fetchKey: boolean = true): UseStreamDetailsResult => {
  const [streamEntity, setStreamEntity] = useState<LiveStreamEntity | null>(null);
  const [streamLoading, setStreamLoading] = useState<boolean>(!!streamId);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamKeyValue, setStreamKeyValue] = useState<string | null>(null);
  const [streamKeyLoading, setStreamKeyLoading] = useState<boolean>(false);
  const [streamKeyError, setStreamKeyError] = useState<string | null>(null);
  const generation = useRef(0);

  const fetchStream = useCallback((background = false) => {
    if (!streamId) return;
    const requestGeneration = generation.current;
    if (!background) setStreamLoading(true);
    setStreamError(null);
    getLiveStream(streamId)
      .then((res: any) => {
        if (requestGeneration !== generation.current) return;
        const entity: any = res?.result || res;
        setStreamEntity(entity || null);
      })
      .catch((e: any) => {
        if (requestGeneration !== generation.current) return;
        setStreamError(e?.message || 'Failed to load stream');
      })
      .finally(() => { if (requestGeneration === generation.current) setStreamLoading(false); });
  }, [streamId]);

  const fetchStreamKey = () => {
    if (!streamId || !fetchKey) return;
    setStreamKeyLoading(true);
    setStreamKeyError(null);
    getStreamKey(streamId)
      .then((res: any) => {
        const key = res?.streamKey || res?.result?.streamKey || res?.data?.streamKey;
        if (key) setStreamKeyValue(key); else setStreamKeyError('No key returned');
      })
      .catch((e: any) => setStreamKeyError(e?.message || 'Failed to fetch key'))
      .finally(() => setStreamKeyLoading(false));
  };

  useEffect(() => {
    generation.current += 1;
    setStreamEntity(null);
    setStreamKeyValue(null);
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
