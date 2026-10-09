import React from 'react';

/** Keep the player unmounted until every access requirement is satisfied. */
export default function FeedAudioContent({ gated, cover, children }: {
  gated: boolean; cover: React.ReactNode; children: React.ReactNode;
}) {
  return <>{cover}{!gated && children}</>;
}
