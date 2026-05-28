import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Platform, Text } from "react-native";
import { mediaDevices, RTCPeerConnection, RTCView } from "react-native-webrtc";
import { runWithPermissions, type PermissionKind } from "../../libs/permissions.util";

// Types
type Facing = "front" | "back";
type PublishStats = { bitrateKbps?: number; fps?: number };

export interface WebRTCPublisherProps {
  streamKey: string;
  active: boolean;
  facing: Facing;
  micMuted: boolean;
  cameraOff: boolean;
  onConnected?: () => void;
  onError?: (e: any) => void;
  onStats?: (s: PublishStats) => void;
  debug?: boolean;
  // New: configurable grace before escalating disconnects (ms)
  disconnectGraceMs?: number;
}

// Utility: request runtime permissions via centralized helper
async function ensureCapturePermissions(): Promise<boolean> {
  const kinds: PermissionKind[] = ["camera", "microphone"];
  let granted = false;
  await runWithPermissions(kinds, async () => {
    granted = true;
  });
  return granted;
}

// Utility: compute RTCView stream URL from MediaStream
function computeStreamURL(ms: any): string | null {
  try {
    if (ms?.toURL) {
      const u = ms.toURL();
      if (u && typeof u === "string") return u;
    }
  } catch {}
  return null;
}

// Resolve regional WHIP endpoint from streamKey
async function resolveWhipEndpoint(streamKey: string): Promise<string> {
  const probe = `https://livepeer.studio/webrtc/${streamKey}`;
  try {
    const resp = await fetch(probe, { method: "HEAD" as any });
    const loc = resp.headers?.get?.("Location");
    if (loc) return loc;
    const url = (resp as any)?.url;
    return url && url !== probe ? url : probe;
  } catch {
    return probe;
  }
}

// Component
const WebRTCPublisher: React.FC<WebRTCPublisherProps> = ({
  streamKey,
  active,
  facing,
  micMuted,
  cameraOff,
  onConnected,
  onError,
  onStats,
  debug = false,
  disconnectGraceMs,
}) => {
  const dbg = (...args: any[]) => { if (debug) console.log('[WebRTCPublisher]', ...args); };
  const dbe = (...args: any[]) => { console.log('[WebRTCPublisher][ERROR]', ...args); };
  // Refs and state
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pcGenerationRef = useRef<number>(0);
  const streamRef = useRef<any>(null);
  const videoSenderRef = useRef<any>(null);
  const audioSenderRef = useRef<any>(null);
  const currentVideoTrackRef = useRef<any>(null);
  const replacingTrackRef = useRef(false);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastVideoBytesRef = useRef<{ bytes: number; ts: number } | null>(null);
  const negotiateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startingRef = useRef(false);
  const disconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  // No auto-retry: only a single connection attempt; on drop after grace -> escalate error
  // Track the camera facing we believe is currently active to avoid accidental flips
  const currentFacingRef = useRef<Facing>("front");
  // Stable callback refs to avoid effect restarts on prop function identity changes
  const onConnectedRef = useRef<WebRTCPublisherProps["onConnected"] | null>(null);
  const onErrorRef = useRef<WebRTCPublisherProps["onError"] | null>(null);
  const onStatsRef = useRef<WebRTCPublisherProps["onStats"] | null>(null);
  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onStatsRef.current = onStats; }, [onStats]);

  const [localURL, setLocalURL] = useState<string | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const acquiringRef = useRef(false);

  // Derived config with defaults — match the backend grace period (90s) so we don't
  // escalate a disconnect as fatal before the server has had a chance to resume.
  const graceMs = useMemo(() => (typeof disconnectGraceMs === 'number' ? disconnectGraceMs : 90000), [disconnectGraceMs]);

  useEffect(() => {
    dbg('config', { graceMs });
  }, [graceMs]);

  // Preview acquisition (single capture)
  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      if (acquiringRef.current) { dbg('acquire() skipped: already acquiring'); return; }
      acquiringRef.current = true;
      dbg('acquire() start', { facing, micMuted, cameraOff, Platform: Platform.OS });
      const granted = await ensureCapturePermissions();
      if (!granted) {
        const err = new Error("Camera/Microphone permission denied");
        dbe('permission denied');
        onErrorRef.current?.(err);
        acquiringRef.current = false;
        return;
      }
      // If we already have a stream, just ensure URL is set
      if (streamRef.current) {
        const url = computeStreamURL(streamRef.current);
        if (url) {
          setLocalURL(url);
          setLocalReady(true);
          dbg('acquire(): existing stream; URL restored');
        }
        acquiringRef.current = false; return;
      }
      try {
        const constraints = {
          video: {
            facingMode: facing === "front" ? "user" : "environment",
          } as any,
          audio: true,
        };
        dbg('getUserMedia() try', constraints);
        let ms: any;
        try {
          ms = await mediaDevices.getUserMedia(constraints);
        } catch {
          dbg('getUserMedia() fallback {video:true,audio:true}');
          ms = await mediaDevices.getUserMedia({ video: true, audio: true });
        }
        if (cancelled) return;
        streamRef.current = ms;
        const v = ms.getVideoTracks?.()[0];
        const a = ms.getAudioTracks?.()[0];
        // Assume we acquired with the requested facing
        currentFacingRef.current = facing;
        // Important for Android: allow camera session to fully configure before muting/pausing
        // We'll apply cameraOff/micMuted in dedicated effects once preview is ready
        if (v) {
          try {
            v.enabled = true;
            dbg('video track acquired', { id: (v as any)?.id, label: (v as any)?.label });
          } catch {}
        }
        if (a) {
          // Do not apply micMuted here; apply it in effect so late acquisition doesn't override state
          try {
            a.enabled = true;
            dbg('audio track acquired', { id: (a as any)?.id, label: (a as any)?.label });
          } catch {}
        }
        const url = computeStreamURL(ms);
        if (url) {
          setLocalURL(url);
          setLocalReady(true);
          dbg('preview URL ready');
        } else {
          setLocalReady(false);
          dbg('preview URL not available yet');
        }
      } catch (e) {
        dbe('acquire() failed', e);
        onErrorRef.current?.(e);
      }
    };
    acquire();
    return () => {
      dbg('acquire() cancel cleanup');
      cancelled = true;
      acquiringRef.current = false;
    };
  }, []);

  // Some devices delay stream.toURL() becoming available; probe briefly when we have a stream but no URL yet
  useEffect(() => {
    if (!streamRef.current || localURL) return;
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      const u = computeStreamURL(streamRef.current);
      if (u) {
        setLocalURL(u);
        setLocalReady(true);
        dbg('toURL() became available after retries', { tries });
        clearInterval(id);
      } else if (tries >= 15) {
        dbg('toURL() retries exhausted');
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, [localURL]);

  // Helper: stop current peer connection
  const stopPeer = useCallback(() => {
    dbg('stopPeer()');
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (negotiateTimeoutRef.current) {
      clearTimeout(negotiateTimeoutRef.current);
      negotiateTimeoutRef.current = null;
    }
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) {
      try { pc.close(); } catch {}
    }
    setConnected(false);
    startingRef.current = false;
  }, [dbg]);

  // No auto-retry

  // Core: start peer connection and negotiate
  const startPeer = useCallback(() => {
    // Each start call gets a unique generation; only the latest is allowed to complete.
    const myGen = (pcGenerationRef.current = pcGenerationRef.current + 1);
    const run = async () => {
      try {
        if (pcRef.current) { dbg('start(): pc already exists; skipping', { gen: myGen }); return; }
        if (startingRef.current) { dbg('start(): already starting; skipping', { gen: myGen }); return; }
        startingRef.current = true;
        // Only start once local preview is ready to avoid early Camera2 session races
        if (!streamRef.current || !localReady) {
          dbg('start(): aborted, stream/localReady not ready', { hasStream: !!streamRef.current, localReady });
          startingRef.current = false;
          return;
        }
        if (!streamKey) {
          dbe('start(): aborted, streamKey is empty');
          startingRef.current = false;
          onErrorRef.current?.(new Error("Stream key missing — cannot publish"));
          return;
        }
        dbg('resolving WHIP endpoint', { gen: myGen });
        const redirectUrl = await resolveWhipEndpoint(streamKey);
  dbg('WHIP endpoint resolved', { gen: myGen, redirectUrl });
  if (myGen !== pcGenerationRef.current) { dbg('start(): stale before PC create', { gen: myGen, currentGen: pcGenerationRef.current }); return; }
        const iceServers = [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ];
        dbg('creating RTCPeerConnection', { gen: myGen, iceServers });
        const pc: any = new RTCPeerConnection({ iceServers });
        // Guard again in case a newer generation won the race just before assignment
        if (myGen !== pcGenerationRef.current) {
          dbg('start(): newer generation detected; closing freshly created PC', { gen: myGen, currentGen: pcGenerationRef.current });
          try { pc.close(); } catch {}
          startingRef.current = false;
          return;
        }
        pcRef.current = pc as RTCPeerConnection;
        setConnected(false);

        const vTrack = streamRef.current.getVideoTracks?.()[0];
        const aTrack = streamRef.current.getAudioTracks?.()[0];
        if (vTrack) {
          currentVideoTrackRef.current = vTrack;
          const vTrans = pc.addTransceiver(vTrack, { direction: "sendonly" });
          videoSenderRef.current = vTrans.sender;
          // Ensure sender track respects current cameraOff
          try { vTrack.enabled = !cameraOff; } catch {}
          // Initialize current facing to match prop when starting
          currentFacingRef.current = facing;
          dbg('video sender added', { cameraOff, facing });
        }
        if (aTrack) {
          const aTrans = pc.addTransceiver(aTrack, { direction: "sendonly" });
          audioSenderRef.current = aTrans.sender;
          aTrack.enabled = !micMuted;
          dbg('audio sender added', { micMuted });
        }

        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          dbg('connectionstatechange', state, { gen: myGen });
          // Ignore state changes from stale generations
          if (myGen !== pcGenerationRef.current) return;
          if (state === "connected") {
            setConnected(true);
            setReconnecting(false);
            // Clear any pending disconnect escalation if we recovered
            if (disconnectTimerRef.current) {
              clearTimeout(disconnectTimerRef.current);
              disconnectTimerRef.current = null;
            }
            // starting phase complete
            startingRef.current = false;
            if (negotiateTimeoutRef.current) {
              clearTimeout(negotiateTimeoutRef.current);
              negotiateTimeoutRef.current = null;
            }
            onConnectedRef.current?.();
          }
          if (state === "failed") {
            setConnected(false);
            setReconnecting(false);
            onErrorRef.current?.(new Error("Peer failed"));
          }
          if (state === "disconnected") {
            setConnected(false);
            // On mobile, disconnected can be transient. Use a grace period before escalating.
            if (!disconnectTimerRef.current) {
              setReconnecting(true);
              disconnectTimerRef.current = setTimeout(() => {
                disconnectTimerRef.current = null;
                const cur = pcRef.current;
                if (!cur || cur.connectionState !== "connected") {
                  setReconnecting(false);
                  onErrorRef.current?.(new Error("Peer disconnected"));
                }
              }, graceMs);
            }
          }
        };

        dbg('creating offer', { gen: myGen });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        dbg('waiting for ICE gathering to complete', { gen: myGen });
        const localDesc: any = await new Promise((resolve) => {
          const max = setTimeout(() => resolve(pc.localDescription), 5000);
          const fn = () => {
            if (pc.iceGatheringState === "complete") {
              clearTimeout(max);
              try { pc.removeEventListener?.("icegatheringstatechange", fn); } catch {}
              resolve(pc.localDescription);
            }
          };
          try { pc.addEventListener?.("icegatheringstatechange", fn); } catch {}
        });
        if (!localDesc?.sdp) throw new Error("Failed to gather ICE candidates");
        dbg('posting offer to WHIP', { gen: myGen });
        const resp = await fetch(redirectUrl, {
          method: "POST",
          headers: { "content-type": "application/sdp" },
          body: localDesc.sdp,
        });
        if (!resp.ok)
          throw new Error(
            `WHIP offer failed: ${resp.status} ${await resp.text()}`
          );
        if (myGen !== pcGenerationRef.current) { dbg('start(): stale or cancelled before applying answer', { gen: myGen, currentGen: pcGenerationRef.current }); return; }
        dbg('received WHIP answer', { gen: myGen });
        const answer = await resp.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answer });

        if (negotiateTimeoutRef.current)
          clearTimeout(negotiateTimeoutRef.current);
        negotiateTimeoutRef.current = setTimeout(() => {
          if (myGen !== pcGenerationRef.current) return;
          if (!pcRef.current || pcRef.current.connectionState !== "connected") {
            setReconnecting(false);
            onErrorRef.current?.(new Error("Negotiation timeout"));
          }
        }, graceMs);

        statsIntervalRef.current = setInterval(async () => {
          try {
            const reports = await pc.getStats();
            let fps: number | undefined;
            let bitrateKbps: number | undefined;
            let bytesSentNow: number | undefined;
            let nowTs = Date.now();
            reports.forEach((r) => {
              if (r.type === "outbound-rtp" && (r as any).kind === "video") {
                if ((r as any).framesPerSecond)
                  fps = (r as any).framesPerSecond;
                if (typeof (r as any).bytesSent === "number")
                  bytesSentNow = (r as any).bytesSent;
              }
            });
            if (typeof bytesSentNow === "number") {
              const prev = lastVideoBytesRef.current;
              if (prev && nowTs > prev.ts && bytesSentNow >= prev.bytes) {
                const deltaBytes = bytesSentNow - prev.bytes;
                const deltaSecs = (nowTs - prev.ts) / 1000;
                const bitsPerSec = (deltaBytes * 8) / (deltaSecs || 1);
                bitrateKbps = Math.round(bitsPerSec / 1000);
              }
              lastVideoBytesRef.current = { bytes: bytesSentNow, ts: nowTs };
            }
            // dbg('stats', { fps, bitrateKbps });
            onStatsRef.current?.({ fps, bitrateKbps });
          } catch {}
        }, 2000);
      } catch (e) {
        dbe('start() failed', e);
        startingRef.current = false;
        onErrorRef.current?.(e);
      }
    };
    run();
    return;
  }, [cameraOff, facing, micMuted, streamKey, localReady, stopPeer, dbg]);

  // Start/stop publishing
  const startPeerRef = useRef<() => void>(() => {});
  const stopPeerRef = useRef<() => void>(() => {});
  useEffect(() => { startPeerRef.current = startPeer; }, [startPeer]);
  useEffect(() => { stopPeerRef.current = stopPeer; }, [stopPeer]);
  useEffect(() => {
    if (active) {
      startPeerRef.current();
    } else {
      stopPeerRef.current();
    }
    return () => {
      // Invalidate any in-flight start by bumping generation on dependency cycle cleanup
      pcGenerationRef.current = pcGenerationRef.current + 1;
    };
  }, [active]);

  // Apply mic toggle to both sender and preview track
  useEffect(() => {
    dbg('micMuted changed -> applying', { micMuted });
    const s: any = streamRef.current;
    const aLocal: any = s?.getAudioTracks?.()[0];
    if (aLocal) {
      try {
        aLocal.enabled = !micMuted;
      } catch {}
    }
    const aSend: any = audioSenderRef.current?.track;
    if (aSend) {
      try {
        aSend.enabled = !micMuted;
      } catch {}
    }
  }, [micMuted, localReady]);

  // Apply camera toggle and handle reacquire when needed
  useEffect(() => {
    // Avoid toggling video before camera session is configured on Android
    if (!localReady) return;
    dbg('cameraOff changed -> applying', { cameraOff });
    const sender: any = videoSenderRef.current;
    const s: any = streamRef.current;
    const vLocal: any = s?.getVideoTracks?.()[0];
    const track: any = sender?.track || currentVideoTrackRef.current || vLocal;
    if (!track) return;
    try {
      track.enabled = !cameraOff;
    } catch {}
    if (vLocal && vLocal !== track) {
      try {
        vLocal.enabled = !cameraOff;
      } catch {}
    }
  }, [cameraOff, localReady]);

  // Flip camera: only when facing prop changes and preview is ready
  useEffect(() => {
    let cancelled = false;
    if (!localReady) return;
    // Do nothing if we already are on the requested facing
    if (currentFacingRef.current === facing) return;
    dbg('facing change -> flip requested', { from: currentFacingRef.current, to: facing });
    const flipInPlace = async () => {
      const s: any = streamRef.current;
      const vLocal: any = s?.getVideoTracks?.()[0];
      const track: any =
        videoSenderRef.current?.track || currentVideoTrackRef.current || vLocal;
      if (!track) return false;
      try {
        const switcher =
          (track as any).switchCamera || (track as any)._switchCamera;
        if (typeof switcher === "function") {
          dbg('switchCamera() available -> flipping in place');
          switcher.call(track);
          currentFacingRef.current = facing;
          return true;
        }
      } catch {}
      return false;
    };

    const replaceTrack = async () => {
      if (!streamRef.current) return;
      try {
        replacingTrackRef.current = true;
        dbg('replaceTrack(): try in-place first');
        // Prefer in-place camera flip to avoid restarting the Camera2 session
        const flipped = await flipInPlace();
        if (flipped) { dbg('replaceTrack(): in-place flip succeeded'); return; }

        const s = await mediaDevices.getUserMedia({
          video: {
            facingMode: facing === "front" ? "user" : "environment",
          } as any,
        });
        dbg('replaceTrack(): acquired new stream for facing', { facing });
        if (cancelled) return;
        const newTrack = s.getVideoTracks?.()[0];
        if (!newTrack) return;
        const local: any = streamRef.current;
        const old: any = local.getVideoTracks?.()[0];

        // Add new track first, then replace the sender, then retire old after a brief delay
        try {
          local.addTrack(newTrack);
          dbg('replaceTrack(): added newTrack to local stream', { id: (newTrack as any)?.id });
        } catch {}
        currentVideoTrackRef.current = newTrack;
        const sender: any = videoSenderRef.current;
        if (sender) {
          try {
            await sender.replaceTrack(newTrack);
            dbg('replaceTrack(): sender.replaceTrack succeeded');
          } catch {}
        }
        // Respect current cameraOff state on the newly attached track
        try {
          newTrack.enabled = !cameraOff;
          dbg('replaceTrack(): applied cameraOff to newTrack', { cameraOff });
        } catch {}
        // We explicitly requested the new facing
        currentFacingRef.current = facing;

        setTimeout(() => {
          if (cancelled) return;
          if (old && old !== newTrack) {
            try {
              local.removeTrack(old);
              dbg('replaceTrack(): removed old track');
            } catch {}
            try {
              old.stop();
              dbg('replaceTrack(): stopped old track');
            } catch {}
          }
          try {
            s.getTracks?.().forEach((t: any) => {
              if (t !== newTrack)
                try {
                  t.stop();
                  dbg('replaceTrack(): stopped temp stream track');
                } catch {}
            });
          } catch {}
        }, 300);

        const url = computeStreamURL(local);
        if (url) { setLocalURL(url); dbg('replaceTrack(): updated preview URL'); }
      } catch (e) {
        dbe('replaceTrack() failed', e);
        onErrorRef.current?.(e);
      } finally {
        replacingTrackRef.current = false;
      }
    };
    // Only flip when preview is ready and not in the middle of replacement
    if (localReady && !replacingTrackRef.current) replaceTrack();
    return () => {
      dbg('flip effect cleanup');
      cancelled = true;
    };
  }, [facing, localReady, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dbg('unmount cleanup start');
      stopPeer();
      const s = streamRef.current;
      streamRef.current = null;
      if (s) {
        try {
          s.getTracks().forEach((t: any) => t.stop());
          dbg('unmount: stopped all local tracks');
        } catch {}
      }
      setLocalURL(null);
      setConnected(false);
      startingRef.current = false;
      dbg('unmount cleanup done');
    };
  }, []);

  // UI
  return (
    <View className="flex-1 bg-black">
      {localURL ? (
        <RTCView
          streamURL={localURL}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          mirror={facing === "front"}
          objectFit={Platform.OS === "ios" ? "cover" : "cover"}
          // @ts-ignore android z-order props
          zOrderMediaOverlay={false}
          // @ts-ignore
          zOrderOnTop={false}
        />
      ) : null}

      {!localReady && (
        <View
          className="absolute inset-0 items-center justify-center"
          pointerEvents="none"
        >
          <View className="bg-black/60 px-4 py-2 rounded-full border border-white/10">
            <Text className="text-white text-xs font-semibold">
              Preparing camera…
            </Text>
          </View>
        </View>
      )}

      {localReady && cameraOff && (
        <View
          className="absolute inset-0 items-center justify-center"
          pointerEvents="none"
        >
          <View className="bg-black/60 px-4 py-2 rounded-full border border-white/10">
            <Text className="text-white text-xs font-semibold">
              Camera off
            </Text>
          </View>
        </View>
      )}

      {localReady && active && !connected && (
        <View
          className="absolute inset-0 items-center justify-center"
          pointerEvents="none"
        >
          <View className="bg-black/60 px-4 py-2 rounded-full border border-white/10">
            <Text className="text-white text-xs font-semibold">
              {reconnecting ? 'Reconnecting…' : 'Connecting…'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

export default WebRTCPublisher;
