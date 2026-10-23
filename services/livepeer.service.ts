// Whether a broadcast's video is reaching its ingest, for the producer's
// going-live and ending polls.
//
// This used to call livepeer.studio directly with a Livepeer API key bundled
// into the app, where anyone could pull it out of the bundle — and it asked
// Livepeer even about self-hosted streams, which Livepeer has never heard of.
// The API now answers from whichever provider the stream actually lives on,
// and the key stays on the server.

import { apiClient } from '../libs/api.client';

export interface IngestStatus {
  provider: 'livepeer' | 'mediamtx';
  status?: string;
  /** null when the provider could not be asked — keep waiting, it is not "off air". */
  isActive: boolean | null;
  /** The provider has no such stream any more. */
  gone?: boolean;
}

export async function getIngestStatus(streamId: string): Promise<IngestStatus> {
  if (!streamId) throw new Error('streamId required');
  const res: any = await apiClient.get<IngestStatus>(
    `/live/${encodeURIComponent(streamId)}/ingest-status`,
    { isAuthRequired: false },
  );
  return (res?.result ?? res) as IngestStatus;
}
