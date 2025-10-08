import { useEffect, useState } from 'react';
import { getLiveStream, getStreamKey, LiveStreamEntity } from '../services/live.service';

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

  const fetchStream = () => {
    if (!streamId) return;
    setStreamLoading(true);
    setStreamError(null);
    getLiveStream(streamId)
      .then((res: any) => {
        const entity: any = res?.result || res;
        setStreamEntity(entity || null);
      })
      .catch((e: any) => {
        setStreamError(e?.message || 'Failed to load stream');
      })
      .finally(() => setStreamLoading(false));
  };

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
    if (!streamId) return;
    fetchStream();
    if (fetchKey) fetchStreamKey();
  }, [streamId, fetchKey]);

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
