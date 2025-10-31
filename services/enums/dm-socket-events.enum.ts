// DM (Direct Messages) socket events namespace enumeration
// Values must match server-side event names exactly.
export enum DMSocketEvent {
  Disconnect = 'disconnect',
  Connection = 'connection',
  FetchMessage = 'fetchMessage',
  Ping = 'ping',
  Pong = 'pong',
  CreateAndStart = 'createAndStart',
  SendMessage = 'sendMessage',
  Error = 'error',
  ReConnect = 'reConnect',
  ReValidateMessage = 'ReValidateMessage',
  DeleteMessage = 'deleteMessage',
  TipUpdate = 'tipUpdate',
  // Test utilities
  Test = 'testDM',
  // Read receipts
  markAsRead= 'markAsRead',      // incoming: mark all messages (not sent by me) as read in a conversation
  readReceipt= 'readReceipt'     // outgoing: notify clients that messages were marked as read
}

// Handy set of DM event strings for quick membership checks
export const DMSocketEventSet: ReadonlySet<string> = new Set(
  Object.values(DMSocketEvent)
);
