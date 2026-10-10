import { LivestreamEvents } from '../services/enums/livestream.enum';

type Emit = (event: string, payload: { streamId: string }) => void;
type Viewer = { refs: number };
const connections = new WeakMap<Emit, { epoch: number; viewers: Map<string, Viewer> }>();

/** One viewer registration shared by the preview and the full player. */
export function acquireStreamViewer(emit: Emit, isConnected: () => boolean, epoch: number, streamId: string) {
  let connection = connections.get(emit);
  if (!connection || connection.epoch !== epoch) {
    connection = { epoch, viewers: new Map() };
    connections.set(emit, connection);
  }
  let viewer = connection.viewers.get(streamId);
  if (!viewer) {
    viewer = { refs: 0 };
    connection.viewers.set(streamId, viewer);
    emit(LivestreamEvents.JoinStream, { streamId });
  }
  viewer.refs += 1;
  let left = false;
  return () => {
    if (left) return;
    left = true;
    if (--viewer.refs > 0 || connections.get(emit) !== connection) return;
    connection.viewers.delete(streamId);
    if (isConnected()) emit(LivestreamEvents.LeaveStream, { streamId });
  };
}
