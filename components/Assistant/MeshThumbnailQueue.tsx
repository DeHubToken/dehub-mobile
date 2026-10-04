import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { saveCreatorPreview, type CreatorAsset } from '../../services/creator.service';

/** A single shared renderer, released after each mesh becomes a stored still. */
export default function MeshThumbnailQueue({ jobs, wallet, onPreview }: {
  jobs: CreatorAsset[]; wallet?: string; onPreview: (id: string, posterUrl: string) => void;
}) {
  const web = useRef<WebView>(null);
  const [attempted, setAttempted] = useState<Set<string>>(() => new Set());
  const activeId = useRef<string | undefined>(undefined);
  const [visible, setVisible] = useState(true);
  useEffect(() => setAttempted(new Set()), [wallet]);
  const job = jobs.find((item) => item.kind === 'model3d' && item.url && !item.posterUrl &&
    (!item.exportFormat || ['glb', 'gltf'].includes(item.exportFormat)) && !attempted.has(item.id));
  useEffect(() => {
    activeId.current = job?.id;
    if (!job) return;
    const timeout = setTimeout(() => setAttempted((previous) => new Set(previous).add(job.id)), 45_000);
    return () => { activeId.current = undefined; clearTimeout(timeout); };
  }, [job?.id, wallet]);
  if (!job || !wallet || !visible) return null;
  const finish = () => setAttempted((previous) => new Set(previous).add(job.id));
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ position: 'absolute', left: -1000, top: 0, width: 256, height: 256 }}>
    <WebView key={job.id} ref={web} source={{ uri: 'https://dehub.io/creator-mesh-preview.html' }}
      javaScriptEnabled originWhitelist={['https://dehub.io']} onError={finish}
      onContentProcessDidTerminate={() => { setVisible(false); finish(); }}
      onMessage={(event) => {
        let message: { type?: string; ready?: boolean; id?: string; dataUrl?: string };
        try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
        if (message.type !== 'creator-mesh-preview') return;
        if (message.ready) { web.current?.injectJavaScript(`window.renderMesh(${JSON.stringify({ id: job.id, url: job.url })}); true;`); return; }
        if (message.id !== activeId.current) return;
        const dataUrl = message.dataUrl;
        if (typeof dataUrl !== 'string' || dataUrl.length > 800_000 || !/^data:image\/(webp|png|jpeg);base64,/.test(dataUrl)) { finish(); return; }
        void saveCreatorPreview(job.id, dataUrl, wallet).then((posterUrl) => {
          if (activeId.current === job.id) onPreview(job.id, posterUrl);
        }).catch(() => { if (activeId.current === job.id) onPreview(job.id, dataUrl); })
          .finally(() => { if (activeId.current === job.id) finish(); });
      }} />
  </View>;
}
