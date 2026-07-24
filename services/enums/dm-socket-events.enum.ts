// DM (Direct Messages) socket events namespace enumeration
// Values must match server-side event names exactly.
export enum DMSocketEvent {
  // Connection lifecycle
  Disconnect = "disconnect",
  Connection = "connection",
  ReConnect = "reConnect",
  Ping = "ping",
  Pong = "pong",
  Error = "error",

  // Conversations
  CreateAndStart = "createAndStart",

  // Messages
  SendMessage = "sendMessage",
  EditMessage = "editMessage",
  ForwardMessage = "forwardMessage",
  DeleteMessage = "deleteMessage",
  FetchMessage = "fetchMessage",
  ReValidateMessage = "ReValidateMessage",

  // Media upload progress/completion keyed by message/job id
  JobMessageId = "jobMessageId",

  // Read & download receipts
  markAsRead = "markAsRead",
  readReceipt = "readReceipt",
  markAsDownloaded = "markAsDownloaded",
  downloadReceipt = "downloadReceipt",

  // Payments
  TipUpdate = "tipUpdate",
  DmFeePayment = "dmFeePayment",
  TipSend = "tipSend",
  FeeConfirmed = "feeConfirmed",

  // Typing indicators
  Typing = "typing",
  StopTyping = "stopTyping",

  // Test utilities
  Test = "testDM",
}

// Handy set of DM event strings for quick membership checks
export const DMSocketEventSet: ReadonlySet<string> = new Set(
  Object.values(DMSocketEvent),
);
