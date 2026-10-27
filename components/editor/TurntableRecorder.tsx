import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

const MAX_VIDEO_DATA_URL = 40_000_000;

/**
 * Records one slow turn of a generated 3D mesh as a video clip, in the same
 * renderer the web editor uses. The view stays on screen but nearly invisible:
 * an off-screen WebView stops painting, and a recording needs painted frames.
 */
export default function TurntableRecorder({ job, onDone }: {
  job: { id: string; url: string } | null;
  onDone: (id: string, videoDataUrl: string | null) => void;
}) {
  const web = useRef<WebView>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!job) return;
    const timeout = setTimeout(() => done.current(job.id, null), 120_000);
    return () => clearTimeout(timeout);
  }, [job]);
  if (!job) return null;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ position: 'absolute', left: 0, bottom: 0, width: 48, height: 48, opacity: 0.01 }}>
    <WebView key={job.id} ref={web} source={{ uri: 'https://dehub.io/creator-mesh-preview.html' }}
      javaScriptEnabled originWhitelist={['https://dehub.io']} onError={() => onDone(job.id, null)}
      onContentProcessDidTerminate={() => onDone(job.id, null)}
      onMessage={(event) => {
        let message: { type?: string; ready?: boolean; id?: string; videoDataUrl?: string; error?: boolean };
        try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
        if (message.type !== 'creator-mesh-preview') return;
        if (message.ready) {
          // Older pages without the recorder answer nothing, and the timeout ends the job.
          web.current?.injectJavaScript(`window.recordTurntable && window.recordTurntable(${JSON.stringify({ id: job.id, url: job.url, size: 720, seconds: 6 })}); true;`);
          return;
        }
        if (message.id !== job.id) return;
        const dataUrl = message.videoDataUrl;
        onDone(job.id, typeof dataUrl === 'string' && dataUrl.length < MAX_VIDEO_DATA_URL && /^data:video\/(webm|mp4);base64,/.test(dataUrl) ? dataUrl : null);
      }} />
  </View>;
}
