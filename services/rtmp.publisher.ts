// RTMP Publisher abstraction
// This is a placeholder that you can later back with an actual native module like react-native-live-stream or NodeMediaClient.
// The interface is intentionally minimal to keep the producer flow isolated from concrete implementation details.

export interface RtmpPublisherConfig {
  url: string;           // e.g. rtmp://rtmp.livepeer.com/live
  streamKey: string;     // livepeer provided stream key
  video?: { width?: number; height?: number; bitrateKbps?: number; fps?: number };
  audio?: { bitrateKbps?: number; channels?: number };
}

export interface RtmpPublisher {
  start: (cfg: RtmpPublisherConfig) => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
}

// Dynamic require to avoid crashing on unsupported targets (web, expo go without prebuild, etc.)
let NodeCameraView: any; // exported for UI layer to render
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NodeCameraView = require('react-native-nodemediaclient').NodeCameraView;
} catch (e) {
  // noop; will fall back to NoopPublisher
}

class NoopPublisher implements RtmpPublisher {
  private running = false;
  async start(cfg: RtmpPublisherConfig) { this.running = true; console.log('[RTMP][stub] start', cfg.url); }
  async stop() { this.running = false; console.log('[RTMP][stub] stop'); }
  isRunning() { return this.running; }
}

class NodeMediaPublisher implements RtmpPublisher {
  private running = false;
  private config: RtmpPublisherConfig | null = null;
  async start(cfg: RtmpPublisherConfig) {
    this.config = cfg;
    this.running = true;
    console.log('[RTMP] NodeMedia start requested', cfg.url);
    // Actual start is performed by rendered <NodeCameraView ... onStatus={...} ref={...} /> component.
  }
  async stop() {
    this.running = false;
    console.log('[RTMP] NodeMedia stop requested');
    // Stopping is handled via ref access (UI component) - out of scope for this abstraction for now.
  }
  isRunning() { return this.running; }
  getCurrentConfig() { return this.config; }
}

let singleton: (NoopPublisher | NodeMediaPublisher) | null = null;

export function getRtmpPublisher(): NoopPublisher | NodeMediaPublisher {
  if (!singleton) singleton = NodeCameraView ? new NodeMediaPublisher() : new NoopPublisher();
  return singleton;
}

export function getNodeCameraView() { return NodeCameraView; }
