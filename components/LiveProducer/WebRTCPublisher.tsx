import React, { useEffect, useRef, useState } from 'react';
import { View, Platform } from 'react-native';
import { mediaDevices, RTCPeerConnection, RTCView } from 'react-native-webrtc';

interface Props {
  whipEndpoint: string;              // WHIP endpoint base or full URL
  authToken: string;                 // stream key or bearer token
  active: boolean;                   // start/stop publishing
  facing: 'front' | 'back';
  onConnected?: () => void;
  onError?: (e: any) => void;
  onStats?: (s: { bitrateKbps?: number; fps?: number }) => void;
}

// Minimal WHIP publisher for Livepeer using react-native-webrtc
const WebRTCPublisher: React.FC<Props> = ({ whipEndpoint, authToken, active, facing, onConnected, onError, onStats }) => {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<any>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [localURL, setLocalURL] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const devices = await mediaDevices.enumerateDevices();
        const videoDevice = devices.find(
          d => d.kind === 'videoinput' && (facing === 'front' ? d.facing === 'user' : d.facing === 'environment')
        ) || devices.find(d => d.kind === 'videoinput');

        const stream = await mediaDevices.getUserMedia({
          video: videoDevice ? { deviceId: videoDevice.deviceId } : true,
          audio: true,
        });
        streamRef.current = stream;
        setLocalURL(stream.toURL());

        const pc = new RTCPeerConnection({ iceServers: [] });
        pcRef.current = pc;
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') onConnected?.();
          if (['failed', 'disconnected'].includes(pc.connectionState)) {
            onError?.(new Error('Peer connection ' + pc.connectionState));
          }
        };

        const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
        await pc.setLocalDescription(offer);

        // Wait for ICE gathering complete (no trickle for WHIP)
        await new Promise<void>(res => {
          if (pc.iceGatheringState === 'complete') return res();
          const handler = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', handler);
              res();
            }
          };
          pc.addEventListener('icegatheringstatechange', handler);
        });

        const sdp = pc.localDescription?.sdp;
        if (!sdp) throw new Error('Missing local SDP');

        const resp = await fetch(whipEndpoint, {
          method: 'POST',
            headers: {
            'Content-Type': 'application/sdp',
            'Authorization': `Bearer ${authToken}`,
          },
          body: sdp,
        });
        if (!resp.ok) throw new Error(`WHIP POST failed: ${resp.status} ${await resp.text()}`);
        const answerSdp = await resp.text();
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

        // Stats collection
        statsIntervalRef.current = setInterval(async () => {
          try {
            const reports = await pc.getStats();
            let bitrateKbps: number | undefined; let fps: number | undefined;
            reports.forEach(r => {
              if (r.type === 'outbound-rtp' && r.kind === 'video') {
                if ((r as any).bitrateMean) bitrateKbps = (r as any).bitrateMean / 1000;
                if ((r as any).framesPerSecond) fps = (r as any).framesPerSecond;
              }
            });
            onStats?.({ bitrateKbps, fps });
          } catch {}
        }, 2000);

      } catch (e) {
        if (!cancelled) onError?.(e);
      }
    }

    if (active) start();

    return () => {
      cancelled = true;
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      const pc = pcRef.current; pcRef.current = null;
      if (pc) {
        pc.getSenders().forEach(s => { try { s.track?.stop(); } catch {} });
        pc.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t: any) => t.stop());
        streamRef.current = null;
      }
      setLocalURL(null);
    };
  }, [active, facing, whipEndpoint, authToken]);

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      {localURL && (
        <RTCView
          streamURL={localURL}
          style={{ flex: 1 }}
          mirror={facing === 'front'}
          objectFit={Platform.OS === 'ios' ? 'cover' : 'cover'}
        />
      )}
    </View>
  );
};

export default WebRTCPublisher;
