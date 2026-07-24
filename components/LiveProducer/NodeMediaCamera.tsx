import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState, useCallback } from 'react';
import { View } from 'react-native';
import { getNodeCameraView, getRtmpPublisher } from '../../services/rtmp.publisher';

export interface NodeMediaCameraProps {
  streamKey?: string | null;
  rtmpUrl: string;
  active: boolean; // whether we should ensure publishing started
  facing: 'front' | 'back';
  onStats?: (stats: { fps?: number; bitrateKbps?: number; dropped?: number }) => void;
  onError?: (reason: string) => void;
}

export interface NodeMediaCameraHandle {
  start: () => void;
  stop: () => void;
}

const NodeMediaCamera = forwardRef<NodeMediaCameraHandle, NodeMediaCameraProps>(({ streamKey, rtmpUrl, active, facing, onStats, onError }, ref) => {
  const NodeCameraView = getNodeCameraView();
  const internalRef = useRef<any>(null);
  const publisher = getRtmpPublisher();

  useImperativeHandle(ref, () => ({
    start: () => {
      if (internalRef.current?.start) internalRef.current.start();
    },
    stop: () => {
      if (internalRef.current?.stop) internalRef.current.stop();
    },
  }), []);

  useEffect(() => {
    if (!NodeCameraView) return;
    if (active && streamKey && internalRef.current?.start) internalRef.current.start();
    else if (!active && internalRef.current?.stop) internalRef.current.stop();
  }, [active, streamKey, NodeCameraView]);

  const handleStatus = useCallback((e: any) => {
    // NodeMedia sends status events; shape may vary. Heuristic parsing:
    try {
      const { msg, code, bitrate, fps, drop } = e || {};
      if (bitrate || fps || drop) onStats?.({ fps, bitrateKbps: bitrate ? Math.round(bitrate / 1000) : undefined, dropped: drop });
      if (code === 2004) { /* publish started */ }
      if (code === 2005) { /* publish stopped */ }
      if (code === 2006) { onError?.('RTMP publish error'); }
    } catch {}
  }, [onStats, onError]);

  if (!NodeCameraView) return <View style={{ flex: 1 }} />;

  const cameraId = facing === 'front' ? 1 : 0;

  return (
    <NodeCameraView
      style={{ flex: 1 }}
      ref={internalRef}
      outputUrl={streamKey ? `${rtmpUrl}/${streamKey}` : undefined}
      camera={{ cameraId, cameraFrontMirror: facing === 'front' }}
      audio={{ bitrate: 128000, profile: 1, samplerate: 44100 }}
      video={{ preset: 12, bitrate: 2500000, profile: 1, fps: 30, videoFrontMirror: facing === 'front' }}
      autopreview
      onStatus={handleStatus}
    />
  );
});

export default NodeMediaCamera;
