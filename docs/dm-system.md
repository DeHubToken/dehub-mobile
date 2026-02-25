# DM (Direct Messaging) System

> **Module:** `src/dm/`
> **Namespace:** WebSocket `/dm` · REST `/dm/*`
> **Last updated:** 24 February 2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [File Map](#file-map)
3. [Database Models](#database-models)
4. [Access Control](#access-control)
5. [Per-Message Fee (Paid DMs)](#per-message-fee-paid-dms)
6. [Tipped Messages (Voluntary Tip Attached to a Message)](#tipped-messages-voluntary-tip-attached-to-a-message)
7. [Custom Tips & Ranking](#custom-tips--ranking)
8. [Payment Confirmation (Register Intent → Webhook Confirms)](#payment-confirmation-register-intent--webhook-confirms)
9. [WebSocket Events](#websocket-events)
10. [REST Endpoints](#rest-endpoints)
11. [Message Lifecycle](#message-lifecycle)
11. [Message Editing](#message-editing)
12. [Message Forwarding](#message-forwarding)
13. [Message Reply (Reply-To)](#message-reply-reply-to)
14. [Voice Notes](#voice-notes)
15. [File Size Limits](#file-size-limits)
16. [Error Codes](#error-codes)
17. [Database Indexes](#database-indexes)
18. [Redis Session Management](#redis-session-management)
19. [Privacy & Security](#privacy--security)
20. [Frontend Integration Guide](#frontend-integration-guide)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Frontend                               │
│   REST (axios/fetch)            Socket.IO (/dm namespace)    │
└───────┬──────────────────────────────────┬───────────────────┘
        │                                  │
        ▼                                  ▼
┌───────────────┐                ┌─────────────────────────┐
│ dm.controller │                │ dm.socket.controller    │
│   (NestJS)    │                │   (Socket.IO gateway)   │
└───────┬───────┘                └────────┬────────────────┘
        │                                 │
        ▼                                 │  withSession()
┌───────────────┐                         │  withRestrictedZone()
│ dm.service    │                         ▼
│ (REST logic)  │                ┌─────────────────────────┐
└───────┬───────┘                │ dm.socket.service       │
        │                        │ (realtime msg logic)     │
        │                        └────────┬────────────────┘
        │                                 │
        ▼                                 ▼
┌──────────────────────────────────────────────────────────────┐
│                     dm.access.ts                              │
│   canInitiateDm() · canSendInExistingDm()                    │
│   isMessageFeeRequired() · verifyMessageFeePayment()         │
│   (centralised access control — single source of truth)      │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│                     MongoDB Models                            │
│ DM · Message · DmSetting · DmTips · TipAndDmTnx             │
└──────────────────────────────────────────────────────────────┘
```

All DMs are **1:1 (user-to-user)** only. There is no group chat functionality.

### Flow summary

1. **Client connects** to Socket.IO `/dm` namespace with a valid JWT.
2. `dm.socket.controller` validates the session via Redis and wraps every
   event in `withSession()` (auth) or `withRestrictedZone()` (auth + conversation access).
3. Real-time message operations (send, edit, forward, delete, read receipts)
   are handled by `dm.socket.service`.
4. REST endpoints handle media uploads, searching users, contacts list,
   per-message fee verification, tipping, and free-access management.

---

## File Map

| File | Purpose |
|---|---|
| `dm.module.ts` | NestJS module — registers controller, service, socket controller |
| `dm.controller.ts` | REST API endpoints (`/dm/*`) |
| `dm.service.ts` | Business logic for REST routes |
| `dm.socket.controller.ts` | Socket.IO event wiring + middleware |
| `dm.socket.service.ts` | Socket event handlers (send, edit, forward, delete, receipts) |
| `dm.access.ts` | Access control engine — fee checks, initiation rules |
| `pipeline.ts` | MongoDB aggregation pipelines for messages + conversations |
| `types.ts` | TypeScript interfaces + socket event enums |

### Models (in `models/message/`)

| File | Collection | Purpose |
|---|---|---|
| `DM.ts` | `dms` | Conversation documents (1:1 only) |
| `dm-messages.ts` | `messages` | Individual messages |
| `message.setting.ts` | `dmsettings` | Per-user DM preferences |
| `tips.ts` | `dmtips` | Per-conversation tip records |
| `tip-and-dm-tnx.ts` | `tipanddmtnxes` | Payment ledger (fees + tips) |

---

## Database Models

### DM (Conversation)

```typescript
{
  participants: [                    // Always exactly 2
    { participant: ObjectId, role: 'member' }
  ],
  conversationType: 'dm',           // Only value — 1:1 DMs
  createdBy: ObjectId,
  deletedForUsers: [{ userId, deletedAt }],
  lastMessageAt: Date,
}
```

### Message

```typescript
{
  sender: ObjectId,
  conversation: ObjectId,           // → DM._id
  content: string,
  msgType: 'msg' | 'media' | 'gif' | 'voice' | 'tip',
  mediaUrls: [{ url, type, mimeType }],
  uploadStatus: 'pending' | 'complete' | 'failed',
  isRead: boolean,                  // default: false
  isDownloaded: boolean,            // default: false
  failureReason: string,

  // Voice notes
  voiceDuration: number,            // Duration in seconds (max 60), null for non-voice

  // Edit tracking
  isEdited: boolean,                // default: false
  editedAt: Date,                   // null until edited

  // Forward tracking
  isForwarded: boolean,             // default: false
  forwardedFrom: {                  // null unless forwarded
    conversationId: ObjectId,
    messageId: ObjectId,
  },

  // Reply tracking
  replyTo: ObjectId | null,         // → Message._id (null if not a reply)

  // Payment tracking (per-message fee / tips)
  paymentStatus: null | 'pending' | 'confirmed',
  //   null       → no payment involved (most messages)
  //   'pending'  → txHash submitted, awaiting on-chain confirmation
  //   'confirmed'→ Alchemy webhook verified the transaction
  paymentTxHash: string | null,     // on-chain tx hash (set only when fee required)

  // Tip message metadata (only populated when msgType === 'tip')
  tipAmount: number | null,         // verified on-chain amount (null while pending)
  tipSymbol: string | null,         // token symbol, e.g. 'DHB' (null while pending)

  // Soft delete
  isDeleted: boolean,               // default: false
}
```

> **Note:** Messages with `paymentStatus: 'pending'` are **only visible to the sender**.
> They are excluded from the receiver's message list, unread count, and push
> notifications until the Alchemy webhook confirms the payment.
> Stale pending messages are auto-deleted after **10 minutes** via a MongoDB TTL index.

### DmSetting (Per-User Preferences)

```typescript
{
  address: string,                  // User's wallet address (lowercase)
  disables: ['NEW_DM' | 'ALL'],    // Opt-out flags
  perMessageFee: number,            // DHB fee per message (default: 0 = free)
  freeAccessUsers: [string],        // Addresses exempt from the fee
}
```

### DmTips

```typescript
{
  conversation: ObjectId,
  tipBy: ObjectId,
  chainId: number,
  amount: number,
  tokenAddress: string,
  symbol: string,
  status: 'pending' | 'success' | 'failed',
}
```

### TipAndDmTnx (Payment Ledger)

```typescript
{
  messageId: ObjectId,              // optional
  tipId: ObjectId,                  // optional — references DmTips
  transactionHash: string,
  senderAddress: string,
  receiverAddress: string,
  tokenAddress: string,
  amount: string,
  chainId: number,
  type: 'dm-fee' | 'tip',
  status: string,
}
```

---

## Access Control

All access decisions are centralised in `dm.access.ts`.

### Initiating a new conversation — `canInitiateDm(sender, receiver)`

| Step | Check | Failure |
|---|---|---|
| 1 | Platform Block (bidirectional) | `BLOCKED` |
| 2 | Receiver has `ALL` in `disables` | `DM_DISABLED` |
| 3 | Receiver has `NEW_DM` in `disables` | `NEW_DM_DISABLED` |
| 4 | ✅ Allowed | — |

### Sending in existing conversation — `canSendInExistingDm(sender, receiver)`

| Step | Check | Failure |
|---|---|---|
| 1 | Platform Block (bidirectional) | `BLOCKED` |
| 2 | Receiver has `ALL` in `disables` | `DM_DISABLED` |
| 3 | ✅ Allowed | — |

### Per-message fee — `isMessageFeeRequired(sender, receiver)`

Returns `{ required: boolean, fee: number, hasFreeAccess: boolean }`.

- If receiver has `perMessageFee > 0` AND sender is **not** in `freeAccessUsers` → `{ required: true, fee, hasFreeAccess: false }`.
- If receiver has `perMessageFee > 0` AND sender **is** in `freeAccessUsers` → `{ required: false, fee, hasFreeAccess: true }`.
  The actual fee amount is still returned so the frontend can display "You have free access (normally X DHB)".
- If receiver has no fee → `{ required: false, fee: 0, hasFreeAccess: false }`.

### Fee payment verification — `verifyMessageFeePayment(sender, receiver, txHash)`

1. Checks if fee is required.
2. If not required → passes immediately.
3. If required and `txHash` is provided → looks up the on-chain transaction,
   verifies amount ≥ fee, and returns `verifiedTx`.
4. If required and no `txHash` → returns error with `DM_FEE_REQUIRED` code.

---

## Per-Message Fee (Paid DMs)

Creators can set a per-message fee in DHB tokens. When enabled, every message
from a non-exempt user requires an on-chain payment.

### How it works

1. Creator sets `perMessageFee` via the DmSetting.
2. When a user sends a message, they include the on-chain `txHash` in the socket event.
3. `verifyMessageFeePayment()` checks for the on-chain confirmation:
   - **Already confirmed** → message is delivered normally to both parties.
   - **Not yet confirmed** → message is created with `paymentStatus: 'pending'` and
     **only delivered to the sender**. The receiver does not see it.
   - **No txHash at all** → error with `DM_FEE_REQUIRED` code + fee amount.
4. The Alchemy webhook processes the on-chain tip event → calls `confirmPendingDmRecords()`:
   - Flips `paymentStatus` to `'confirmed'`
   - Delivers the message to the receiver via socket (`sendMessage` event)
   - Sends push notification
   - Updates `lastMessageAt` on the conversation
   - Creates `DmTips` + `TipAndDmTnx` ledger records
5. If the on-chain tx never confirms within **10 minutes**, the pending message
   is automatically deleted by a MongoDB TTL index.

### Free access management

Creators can exempt specific users from their per-message fee:

| Endpoint | Method | Purpose |
|---|---|---|
| `/dm/free-access` | POST | Add address to free list |
| `/dm/free-access` | DELETE | Remove address from free list |
| `/dm/free-access/:address` | GET | Get creator's free access list |

---

## Tipped Messages (Voluntary Tip Attached to a Message)

Users can attach a **voluntary tip** to any regular message (text, gif, media,
voice) — even when the receiver has **no per-message fee**. This is different
from both per-message fees and standalone tip messages:

| Type | `txHash` | `tipTxHash` | `msgType` | Content | Amount decided by |
|---|---|---|---|---|---|
| Per-message fee | ✅ | — | msg/gif/media/voice | ✅ normal content | Creator (fixed) |
| Tipped message | — | ✅ | msg/gif/media/voice | ✅ normal content | Sender (voluntary) |
| Standalone tip | — | — (via REST) | tip | ❌ none | Sender (voluntary) |

### How it works

1. User sends an on-chain tip via `StreamController.sendTip()`.
2. User emits `sendMessage` with `tipTxHash` (instead of `txHash`):
   ```typescript
   socket.emit('sendMessage', {
     dmId: conversationId,
     content: 'Great content!',
     type: 'msg',            // or 'gif', 'media', 'voice'
     tipTxHash: '0x...',     // voluntary tip — can send immediately after tx submit
   });
   ```
3. Backend verifies the tip tx:
   - **Already confirmed on-chain** → message created with `paymentStatus: 'confirmed'`,
     `tipAmount`, `tipSymbol`. Delivered to both parties normally.
   - **Not yet confirmed** → message created with `paymentStatus: 'pending'`.
     **Only delivered to the sender**. Receiver doesn't see it until the webhook confirms.
4. Alchemy webhook confirms → sets `tipAmount`/`tipSymbol`, delivers message to receiver,
   push notification, `lastMessageAt` update — same flow as per-message fee confirmation.
5. Pending tip messages auto-delete after **10 minutes** if the tx never confirms.

### Tipped message shape

```typescript
{
  _id: ObjectId,
  conversation: ObjectId,
  sender: { _id, username, address, displayName, avatarImageUrl },
  content: 'Great content!',      // normal message content
  msgType: 'msg',                 // NOT 'tip' — this is a regular message with tip
  tipAmount: 500,                 // verified on-chain amount (null while pending)
  tipSymbol: 'DHB',               // token symbol (null while pending)
  paymentStatus: 'confirmed',     // 'pending' until webhook confirms
  paymentTxHash: '0x...',
  author: 'me' | 'other',
  createdAt: Date,
}
```

> **Frontend rendering**: when `tipAmount` is set and `msgType !== 'tip'`, show the
> normal message content **plus** a tip badge (e.g. "Tipped 500 DHB" overlay or
> accent border). This distinguishes it from standalone tip messages which have
> no content.

---

## Custom Tips & Ranking

Users can send voluntary tips within conversations (separate from per-message fees).
Tips create an **inline tip message** (`msgType: 'tip'`) in the conversation so both
participants can see it in the message stream — e.g. "You tipped 10,000 DHB" /
"X tipped you 10,000 DHB".

### Tipping flow

1. User sends tip on-chain via `StreamController.sendTip()`.
2. Frontend calls `POST /dm/tip-notify` with `{ txHash, conversationId, senderAddress }`.
   - **No need to wait** for on-chain confirmation — can call immediately after submitting the tx.
3. If the tx is **already confirmed** on-chain (HTTP 201):
   - `DmTips` + `TipAndDmTnx` created as `confirmed`.
   - **Inline tip message** created with `msgType: 'tip'`, `tipAmount`, `tipSymbol`.
   - Message delivered to both participants via `sendMessage` socket event.
   - Response includes populated `tipMessage` object.
4. If the tx is **not yet confirmed** (HTTP 202):
   - `DmTips` + `TipAndDmTnx` created as `pending`.
   - **Pending tip message** created with `msgType: 'tip'`, `paymentStatus: 'pending'`.
   - Message delivered to **sender only** via socket (receiver won't see it).
   - The Alchemy webhook auto-confirms: flips `paymentStatus` to `'confirmed'`,
     writes `tipAmount` / `tipSymbol`, and delivers the message to the receiver.
   - Pending tip messages auto-delete after 10 minutes if the tx never confirms.
5. Once confirmed: `DmTips` (status: `success`) + `TipAndDmTnx` (status: `confirmed`) are written.
6. Increments `Account.sentTips` for sender and `Account.receivedTips` for receiver.
7. Emits `tipSend` event for real-time ranking updates.

### Tip message shape

```typescript
{
  _id: ObjectId,
  conversation: ObjectId,
  sender: { _id, username, address, displayName, avatarImageUrl },
  msgType: 'tip',
  tipAmount: 10000,          // null while pending, set on confirmation
  tipSymbol: 'DHB',          // null while pending, set on confirmation
  paymentStatus: 'confirmed' | 'pending',
  paymentTxHash: '0x...',
  author: 'me' | 'other',
  createdAt: Date,
  updatedAt: Date,
}
```

### `POST /dm/verify-dm-fee` (Register Intent)

Same pattern — frontend can call immediately after submitting the tx:
- **Confirmed** → creates `TipAndDmTnx` with `status: 'confirmed'` (HTTP 201)
- **Not yet confirmed** → creates `TipAndDmTnx` with `status: 'pending'` (HTTP 202)
- Webhook auto-confirms when the block lands

### Conversation ranking

Conversations are sorted by total received tips (descending), then by last
message date. This is computed in `pipeline.ts` via the `dmTips` aggregation
stage which sums all successful tips per conversation.

---

## Payment Confirmation (Register Intent → Webhook Confirms)

The DM system uses a **"register intent → webhook confirms"** pattern for all
on-chain payments (per-message fees and tips). This eliminates the need for the
frontend to wait for on-chain confirmation before calling the backend.

### Flow diagram

```
Frontend                   Backend                    Blockchain / Alchemy
   │                         │                              │
   │── submit tx on-chain ──►│                              │
   │                         │                              │
   │── sendMessage / ────────►│                              │
   │   tipNotify / verifyFee │                              │
   │   { txHash }            │── create records as ────────►│
   │                         │   'pending'                  │
   │◄── 202 / sendMessage ──│                              │
   │    (sender-only)        │                              │
   │                         │                              │
   │                         │     ┌── block confirmed ─────│
   │                         │     │                        │
   │                         │◄────┤ Alchemy webhook        │
   │                         │     │ handleTip()            │
   │                         │     └────────────────────────│
   │                         │                              │
   │                         │── confirmPendingDmRecords()  │
   │                         │   1. Flip status → 'confirmed'
   │                         │   2. Create DmTips + TipAndDmTnx
   │                         │   3. Update Account tip counters
   │                         │   4. Deliver message to receiver (socket)
   │                         │   5. Send push notification
   │                         │   6. Update conversation lastMessageAt
   │                         │                              │
   │◄── feeConfirmed ───────│  (sender: status update)     │
   │◄── sendMessage ─────────│  (receiver: full message)    │
```

### Race conditions

| Scenario | What happens |
|---|---|
| **Webhook first, frontend second** | `handleTip()` writes `TransactionModel`, finds no pending DM records → does nothing extra. When frontend then calls `tipNotify` / `verifyDmFee` / `sendMessage`, it finds `TransactionModel` already confirmed → creates records as `confirmed` immediately. Message is delivered to both parties in real time. |
| **Frontend first, webhook second** | Frontend creates pending records. Webhook fires → `confirmPendingDmRecords()` flips everything to `confirmed` → delivers message to receiver → push notification. |
| **Webhook never arrives (tx fails / reverts)** | Pending message is auto-deleted after **10 minutes** by MongoDB TTL index. Pending `TipAndDmTnx` and `DmTips` records remain with `pending` status (harmless — they're filtered from all queries by `status: 'success'` filters). |

### Pending message visibility rules

| Viewer | Sees pending-payment message? | Notes |
|---|---|---|
| **Sender** | ✅ Yes | Shown with `paymentStatus: 'pending'` — frontend should display a "confirming" indicator |
| **Receiver** | ❌ No | Filtered out by pipelines. Delivered only after `paymentStatus` flips to `'confirmed'` |
| **Unread count** | ❌ Excluded | Pending messages don't increment the receiver's unread badge |
| **Push notification** | ❌ Not sent | Push notification is sent only after confirmation |
| **Conversation list** | ❌ Not in preview | `lastMessageAt` is NOT updated until confirmation |

### Auto-cleanup

A MongoDB TTL index on the `messages` collection automatically deletes messages
where `paymentStatus === 'pending'` and `createdAt` is older than 10 minutes.
This prevents orphaned pending messages from accumulating if the on-chain tx
never confirms (e.g., insufficient gas, user closed app before tx submitted).

```
Index: { createdAt: 1 }
TTL:   600 seconds (10 minutes)
partialFilterExpression: { paymentStatus: 'pending' }
```

---

## WebSocket Events

### Connection

```typescript
const socket = io('/dm', {
  auth: { token: 'Bearer <JWT>' },
});
```

### Event Reference

| Event | Direction | Payload | Description |
|---|---|---|---|
| `sendMessage` | Client → Server | `{ dmId, content, type, gif?, txHash?, tipTxHash?, voiceDuration?, replyTo? }` | Send a new message. `txHash` = per-message fee, `tipTxHash` = voluntary tip attached |
| `sendMessage` | Server → Client | `{ ...message, author: 'me'\|'other' }` | Delivered message (see [pending payment notes](#pending-message-visibility-rules)) |
| `editMessage` | Client → Server | `{ dmId, messageId, content }` | Edit a message |
| `editMessage` | Server → Client | `{ messageId, dmId, content, isEdited, editedAt, author }` | Edited message broadcast |
| `forwardMessage` | Client → Server | `{ messageId, targetDmId, txHash? }` | Forward message to another DM |
| `forwardMessage` | Server → Client | `{ ...message, author: 'me' }` | Forwarded message (to sender) |
| `deleteMessage` | Client → Server | `{ dmId, messageId }` | Delete own message |
| `deleteMessage` | Server → Client | `{ dmId, messageId }` | Deleted message broadcast |
| `createAndStart` | Client → Server | `{ _id: userId }` | Create or resume a DM |
| `createAndStart` | Server → Client | `{ msg, data: { ...dm, dmFee } }` | Conversation data + fee info (see [dmFee shape](#dmfee-shape)) |
| `readReceipt` | Client → Server | `{ dmId }` | Mark messages as read |
| `readReceipt` | Server → Client | `{ dmId, readBy, count }` | Read receipt broadcast |
| `downloadReceipt` | Client → Server | `{ dmId, messageId }` | Mark media as downloaded |
| `downloadReceipt` | Server → Client | `{ dmId, messageId, downloadedBy, updated }` | Download receipt broadcast |
| `fetchMessage` | Client → Server | `{ dmId, messageId }` | Revalidate a single message |
| `ReValidateMessage` | Server → Client | `{ dmId, message }` | Revalidated message data |
| `dmFeePayment` | Server → Client | `{ msg, senderName, amount }` | DM fee payment notification (receiver only) |
| `tipUpdate` | Server → Client | `{ dmId, tips }` | Tip ranking update (both participants) |
| `feeConfirmed` | Server → Client | `{ messageId, conversationId, txHash, amount, status }` | Per-message fee / tip confirmed on-chain (sender only — receiver gets `sendMessage` instead) |
| `sendMessage` | Server → Client | Tip message object | Inline tip message delivered to both (confirmed) or sender-only (pending). `msgType === 'tip'`. |
| `conversationDeleted` | Server → Client | `{ dmId, userId, address }` | Conversation permanently deleted (caller only, emitted after `DELETE /dm/conversation/:dmId`) |
| `error` | Server → Client | `{ msg, code?, ... }` | Error response |

---

## REST Endpoints

### Search

| Method | Path | Description |
|---|---|---|
| GET | `/dm/search?searchQuery=...` | Search users by username/displayName |

### Conversations & Messages

| Method | Path | Description |
|---|---|---|
| GET | `/dm/contacts/:address` | Get user's conversations (with last 20 messages each) |
| GET | `/dm/:id` | Get single conversation by ID |
| GET | `/dm/messages/:id?page=&limit=` | Paginated messages for a conversation |

### Media Upload

| Method | Path | Description |
|---|---|---|
| POST | `/dm/upload` | Upload media/voice message (multipart form, max 5 files) |

**Body (multipart/form-data):**
- `files` — up to 5 files
- `conversationId` — conversation ID
- `senderId` — sender wallet address
- `content` — (optional) text caption
- `msgType` — `'media'` or `'voice'` (default: `'media'`)
- `voiceDuration` — (optional, voice only) duration in seconds (max 60)
- `replyTo` — (optional) message ID being replied to
- `txHash` — (optional) per-message fee transaction hash

### Fee & Tip Verification

| Method | Path | Description |
|---|---|---|
| POST | `/dm/verify-dm-fee` | Verify a per-message fee payment |
| POST | `/dm/tip-notify` | Notify backend of a tip transaction |

### Free Access Management

| Method | Path | Description |
|---|---|---|
| POST | `/dm/free-access` | Add address to creator's free list |
| DELETE | `/dm/free-access` | Remove address from creator's free list |
| GET | `/dm/free-access/:address` | Get creator's free access list |

### User Status

| Method | Path | Description |
|---|---|---|
| POST | `/dm/user-status/:address` | Update DM preferences (`disables`, `perMessageFee`) |
| GET | `/dm/user-status/:address` | Get DM preferences |

### Message Management

| Method | Path | Description |
|---|---|---|
| POST | `/dm/delete-messages` | Soft-delete all messages in a conversation (one-sided) |
| DELETE | `/dm/conversation/:dmId` | Permanently delete a conversation for the caller |

#### `DELETE /dm/conversation/:dmId` — Delete Conversation

Permanently removes a DM conversation from the caller's perspective. This is a
**hard delete** — unlike the soft "delete messages" endpoint, the conversation
will no longer appear in the caller's contacts list.

**What happens server-side:**

1. **Hard-deletes** every `Message` document that the caller sent in this conversation.
2. **Soft-deletes** remaining messages from the other party (sets `deletedForUsers` timestamp
   so they are invisible to the caller if the DM document is ever accessed again).
3. **Removes the other participant** from the sender's contact list, so the
   conversation no longer appears in their contacts list (`GET /dm/contacts/:address`).
4. **Removes the caller** from the conversation's `participants` array.
5. **Cleans up** related `DmTips` and `TipAndDmTnx` records that the caller created.
6. **Emits** a real-time `conversationDeleted` socket event to the caller.

> The other participant's view of the conversation is completely unaffected.
> Their messages, tips, and contact list remain unchanged.

**Request:**

| Field | Location | Type | Required | Description |
|---|---|---|---|---|
| `dmId` | URL param | string | Yes | Conversation (DM) ID |
| `address` | Body | string | Yes | Caller's wallet address (lowercase) |

**Response (200):**

```json
{
  "success": true,
  "message": "Conversation deleted permanently.",
  "deletedMessages": 42
}
```

**Errors:**

| Status | Message |
|---|---|
| 400 | `Address is required.` |
| 400 | `A valid DM ID is required.` |
| 404 | `User not found.` |
| 404 | `Conversation not found or you are not a participant.` |

**Frontend integration:**

```typescript
// Delete a conversation
const response = await api.delete(`/dm/conversation/${dmId}`, {
  data: { address: myAddress },
});

// Listen for real-time confirmation (optional — the REST response is sufficient)
socket.on('conversationDeleted', ({ dmId }) => {
  // Remove the conversation from local state / contacts list
  removeConversationFromList(dmId);
});
```

### Deprecated (kept for backward compat)

| Method | Path | Description |
|---|---|---|
| POST | `/dm/block` | Block a user (use platform block instead) |
| GET | `/dm/un-block/:conversationId` | Unblock (use platform unblock instead) |

---

## Message Lifecycle

### Input Validation

All socket `sendMessage` payloads are validated before processing:

| Field | Rule | Error |
|---|---|---|
| `type` | Must be one of `'msg'`, `'gif'`, `'media'`, `'voice'` | `Invalid message type.` |
| `content` | Max 5,000 characters (text messages) | `Message content cannot exceed 5000 characters.` |
| `voiceDuration` | Max 60 seconds (voice messages) | Clamped server-side |
| `replyTo` | Must be a valid ObjectId referencing a message in the same conversation | `Invalid replyTo message ID.` / `Replied-to message not found in this conversation.` |

### dmFee Shape

The `createAndStart` response includes a `dmFee` object:

```typescript
interface DmFee {
  required: boolean;     // true → frontend must collect payment before sending
  fee: number;           // DHB amount (always the actual fee, even when free access)
  hasFreeAccess: boolean; // true → sender is whitelisted, can send for free
}
```

**Frontend logic:**
- `required === true` → show fee prompt, collect `txHash` before every message
- `hasFreeAccess === true && fee > 0` → show "Free access" badge (fee is waived)
- `fee === 0` → DMs are free for everyone

> **Note:** `freeAccessUsers` is **not** exposed in the account-info endpoint.
> The `hasFreeAccess` boolean in the `createAndStart` response is the recommended
> way for frontends to detect free-access status. The raw whitelist is only available
> via the dedicated `GET /dm/free-access/:address` endpoint (for the creator's own management UI).

### Contacts Response & Unread Count

The `GET /dm/contacts/:address` response now includes an `unreadCount` field per
conversation — the number of messages not yet read by the requesting user.

```typescript
interface ContactConversation {
  _id: string;
  participants: [...];
  lastMessageAt: Date;
  messages: Message[];        // last 20 messages
  tips: DmTip[];
  unreadCount: number;        // ← NEW — unread message count for badge display
}
```

Use `unreadCount` to render badge numbers on the conversation list (like WhatsApp / iMessage).
The count resets when the user emits a `readReceipt` event for that conversation.

### Send (socket)

```
Client                    Server                         DB / Alchemy
  │                         │                             │
  ├─ sendMessage ──────────►│                             │
  │  { dmId, content,       │── validate content          │
  │    type, txHash?,       │   (type ∈ valid set,        │
  │    replyTo? }           │    content ≤ 5000 chars)    │
  │                         │── validate replyTo (if set) │
  │                         │── verifyMessageFeePayment() │
  │                         │                             │
  │                         │   ┌─ fee NOT required ──────│
  │                         │   │  OR tx confirmed        │
  │                         │   │                         │
  │                         │   │── MessageModel.create() │
  │                         │   │── broadcastToOthers()   │
  │                         │   │── pushNotifications()   │
  │                         │   │── recordFeePayment()    │
  │◄── sendMessage ─────────│   │  { author: 'me' }      │
  │                         │   └─────────────────────────│
  │                         │                             │
  │                         │   ┌─ fee required, tx       │
  │                         │   │  NOT YET confirmed      │
  │                         │   │  (pending)              │
  │                         │   │── MessageModel.create() │
  │                         │   │  { paymentStatus:       │
  │                         │   │    'pending' }          │
  │◄── sendMessage ─────────│   │  { author: 'me' }      │
  │    (sender ONLY)        │   │                         │
  │                         │   │  ❌ NO broadcast        │
  │                         │   │  ❌ NO push notif       │
  │                         │   │  ❌ NO lastMessageAt    │
  │                         │   └─────────────────────────│
  │                         │                             │
  │      ... time passes ...│    Alchemy webhook fires    │
  │                         │◄── handleTip() ─────────────│
  │                         │── confirmPendingDmRecords() │
  │                         │   paymentStatus→'confirmed' │
  │                         │   lastMessageAt updated     │
  │◄── feeConfirmed ───────│                             │
  │    (sender: status)     │                             │
  │                         │── deliver to receiver ──────│
  │                         │   sendMessage { author:     │
  │                         │     'other' }               │
  │                         │── pushNotification() ───────│
```

### Upload (REST)

```
Client                    Server                         CDN / DB
  │                         │                             │
  ├─ POST /dm/upload ──────►│                             │
  │  (multipart + dmId)     │── verifyMessageFeePayment() │
  │                         │── MessageModel.create()     │
  │                         │   (uploadStatus: pending)   │
  │                         │── CDN upload job ──────────►│
  │◄── 200 { message } ────│                             │
  │                         │── job.onComplete() ────────►│ (update mediaUrls)
```

---

## Message Editing

Users can edit their own **text messages** (`msgType: 'msg'`). Media and GIF
messages cannot be edited.

### Socket event: `editMessage`

**Client sends:**
```json
{
  "dmId": "conversation-id",
  "messageId": "message-id",
  "content": "Updated message text"
}
```

**Server broadcasts:**
```json
{
  "messageId": "message-id",
  "dmId": "conversation-id",
  "content": "Updated message text",
  "isEdited": true,
  "editedAt": "2026-02-23T12:00:00.000Z",
  "author": "me"
}
```

### Rules

- Only the message sender can edit.
- Only `msgType: 'msg'` (text) messages can be edited.
- Content cannot exceed **5,000 characters**.
- The `isEdited` flag is permanently set to `true` after first edit.
- `editedAt` records the timestamp of the most recent edit.
- The UI should display an "edited" tag when `isEdited` is true.

---

## Message Forwarding

Users can forward any message to another 1:1 conversation they participate in.

### Socket event: `forwardMessage`

**Client sends:**
```json
{
  "messageId": "original-message-id",
  "targetDmId": "target-conversation-id",
  "txHash": "optional-fee-tx-hash"
}
```

**Server broadcasts:**
- Sender receives `forwardMessage` event with the new message (author: 'me')
- Target conversation recipient receives `sendMessage` event (appears as new incoming message)

### Rules

- User must be a participant in the target conversation.
- Access control (block check) is enforced for the target conversation.
- Per-message fee is checked for the target conversation (if the recipient has a fee set).
- The forwarded message has `isForwarded: true` and `forwardedFrom` references.
- Content, media, and message type are copied from the original.
- The UI should display a "forwarded" tag when `isForwarded` is true.

---

## Message Reply (Reply-To)

Users can reply to any message within the same conversation, Instagram-style.
The replied-to message is stored as a reference and returned as an inline
preview in all message responses.

### How it works

1. Client includes `replyTo: "<messageId>"` when sending a message (socket or REST upload).
2. Server validates that the referenced message exists **in the same conversation**.
3. The `replyTo` ObjectId is stored on the new message.
4. When messages are fetched (single, paginated, or conversation list), the
   `replyTo` field is populated with a lightweight preview via a `$lookup`
   aggregation.

### Reply preview shape

All message responses include a `replyTo` field which is either `null` (not a
reply) or an object:

```typescript
interface ReplyPreview {
  _id: string;                       // Replied-to message ID
  content: string;                   // First 200 characters of the original text
  msgType: 'msg' | 'media' | 'gif' | 'voice';
  mediaUrls: [{ url, type, mimeType }];  // First media item only (for thumbnail)
  voiceDuration: number | null;
  sender: {                          // Who wrote the original message
    _id: string;
    username: string;
    address: string;
    displayName: string;
    avatarImageUrl: string;
  };
}
```

### Socket event: `sendMessage` (with reply)

**Client sends:**
```json
{
  "dmId": "conversation-id",
  "content": "Totally agree!",
  "type": "msg",
  "replyTo": "original-message-id"
}
```

**Server responds:**
```json
{
  "_id": "new-msg-id",
  "sender": { "_id": "...", "username": "alice", ... },
  "content": "Totally agree!",
  "msgType": "msg",
  "replyTo": {
    "_id": "original-message-id",
    "content": "This is the original message text...",
    "msgType": "msg",
    "mediaUrls": [],
    "voiceDuration": null,
    "sender": { "_id": "...", "username": "bob", ... }
  },
  "author": "me",
  "createdAt": "2026-02-24T12:00:00.000Z"
}
```

### REST upload (with reply)

```typescript
const form = new FormData();
form.append('conversationId', conversationId);
form.append('senderId', myAddress);
form.append('replyTo', originalMessageId);   // ← reply reference
form.append('files', imageFile);
const result = await fetch('/dm/upload', {
  method: 'POST',
  headers: authHeaders,
  body: form,
});
```

### Rules

- `replyTo` is optional on all message sends (socket and REST).
- The replied-to message must exist in the **same conversation** (`dmId`).
- If `replyTo` is an invalid ObjectId → error: `Invalid replyTo message ID.`
- If `replyTo` references a message in a different (or non-existent) conversation → error: `Replied-to message not found in this conversation.`
- Forwarded messages do **not** carry the original's `replyTo` context.
- Deleting a replied-to message does **not** cascade — the reply preview
  will simply resolve to `null` (the `$lookup` returns an empty array).
- Content in the preview is truncated to **200 characters** server-side.
- Only the **first media item** is included in the preview (for thumbnail display).

### UI recommendations

- When `replyTo !== null`, render a compact preview bubble above the message
  showing the replied-to sender's name and a snippet of content/media.
- For media replies (`replyTo.msgType === 'media'`), show a small thumbnail
  from `replyTo.mediaUrls[0]`.
- For voice replies (`replyTo.msgType === 'voice'`), show a microphone icon
  with the duration.
- For GIF replies (`replyTo.msgType === 'gif'`), show a small GIF thumbnail.
- Tapping the reply preview should scroll to / highlight the original message.
- If the original message was deleted, `replyTo` will be `null` — show
  "Original message deleted" or simply hide the preview.
- On the compose bar, when the user long-presses / swipes on a message to
  reply, show a small preview strip (sender + content) that can be dismissed.

---

## Voice Notes

Users can send voice notes in DM conversations. Voice notes are treated as a
dedicated message type with duration tracking.

### How it works

1. Client records a voice note (max 60 seconds).
2. Client sends via REST (`POST /dm/upload`) or socket (`sendMessage` with `type: 'voice'`).
3. For REST uploads, client sends `msgType: 'voice'` and `voiceDuration` in the form data.
4. For socket messages, client sends `type: 'voice'` and `voiceDuration` in the event payload.
5. Backend validates:
   - Audio file type (supported: mp3, mp4, ogg, wav, webm, aac, m4a)
   - File size ≤ 2 MB
   - Duration ≤ 60 seconds
6. Message is stored with `msgType: 'voice'` and `voiceDuration` field.

### Socket event

```json
{
  "dmId": "conversation-id",
  "content": "",
  "type": "voice",
  "voiceDuration": 30
}
```

### REST upload

```typescript
const form = new FormData();
form.append('conversationId', conversationId);
form.append('senderId', myAddress);
form.append('msgType', 'voice');
form.append('voiceDuration', '30');
form.append('files', audioFile);
const result = await fetch('/dm/upload', {
  method: 'POST',
  headers: authHeaders,
  body: form,
});
```

### UI recommendations

- Display a waveform or audio player for voice messages (`msgType === 'voice'`).
- Show duration from the `voiceDuration` field (e.g., "0:30").
- Push notification preview displays "🎤 Sent a voice note".

---

## File Size Limits

All file uploads in DM are validated for size and type.

| File Type | Max Size | Supported Formats |
|---|---|---|
| Image | 10 MB | PNG, JPEG, JPG, GIF |
| Video | 50 MB | MP4, QuickTime |
| Audio/Voice | 2 MB | MP3, MP4, OGG, WAV, WebM, AAC, M4A |

### Voice note limits

- **Max duration:** 60 seconds
- **Max file size:** 2 MB

### Error responses

| Status | Code | Description |
|---|---|---|
| 413 | `FILE_TOO_LARGE` | File exceeds the size limit for its type |
| 415 | `UNSUPPORTED_FILE_TYPE` | Audio file type not supported |
| 400 | `VOICE_TOO_LONG` | Voice note exceeds 60 second limit |

### Constants (config/constants.ts)

```typescript
DM_IMAGE_MAX_SIZE  = 10 * 1024 * 1024  // 10 MB
DM_VIDEO_MAX_SIZE  = 50 * 1024 * 1024  // 50 MB
DM_VOICE_MAX_SIZE  = 2 * 1024 * 1024   // 2 MB
DM_VOICE_MAX_DURATION = 60             // seconds
```

---

## Error Codes

| Code | Meaning |
|---|---|
| `BLOCKED` | Platform-level block between users |
| `DM_DISABLED` | Receiver has disabled all DMs |
| `NEW_DM_DISABLED` | Receiver has disabled new DM conversations |
| `DM_FEE_REQUIRED` | Per-message fee required but not paid |
| `INVALID_TX` | Transaction hash not found or invalid |
| `INSUFFICIENT_FEE` | Payment amount less than required fee |
| `FILE_TOO_LARGE` | Uploaded file exceeds the size limit for its type |
| `UNSUPPORTED_FILE_TYPE` | File MIME type is not supported |
| `VOICE_TOO_LONG` | Voice note duration exceeds 60 seconds |

---

## Database Indexes

Compound indexes are defined on the DM and Message collections to optimise the
most common query patterns (contacts list, message pagination, read receipts).

### Message collection (`messages`)

| Index | Purpose |
|---|---|
| `{ conversation: 1, createdAt: -1 }` | Paginated message queries (sorted newest-first) |
| `{ conversation: 1, isRead: 1, sender: 1 }` | Bulk `markAsRead` updates and unread-count lookups |

### DM collection (`dms`)

| Index | Purpose |
|---|---|
| `{ 'participants.participant': 1 }` | Core participant lookup |
| `{ 'participants.participant': 1, lastMessageAt: -1 }` | Contacts list sorted by recent activity |
| `{ 'participants.participant': 1, conversationType: 1 }` | Duplicate-conversation prevention (`background: true`) |

---

## Redis Session Management

DM sessions are stored in Redis database 2 with a 24-hour TTL.

```
Key:      user:{address}
Value:    { socketIds: [...], user: { _id, address, ... } }
TTL:      86400 seconds (24 hours)
```

### Session lifecycle

1. **Connect:** Socket controller stores session in Redis via `SET`.
2. **Reconnect:** Appends new socket ID to existing session's `socketIds` array.
3. **Disconnect:** Removes socket ID from array; deletes key if array is empty.
4. **Message delivery:** Looks up recipient's session → gets socket IDs → emits.

---

## Privacy & Security

- **JWT authentication** required for all socket connections and REST endpoints.
- **Block enforcement** checked on every message send via `dm.access.ts`.
- **1:1 only** — no group functionality, reducing attack surface.
- **DM disable flags** (`ALL`, `NEW_DM`) give users full control.
- **Per-message fee** serves as an economic spam filter.
- **Free-access list** allows creators to exempt trusted users from fees.
- **On-chain verification** — fee payments verified against `TransactionModel`.

---

## Frontend Integration Guide

### Quick Start

```typescript
import { io } from 'socket.io-client';

// 1. Connect
const socket = io(`${API_URL}/dm`, {
  auth: { token: `Bearer ${jwt}` },
});

// 2. Create or resume a conversation
socket.emit('createAndStart', { _id: otherUserId });
socket.on('createAndStart', (res) => {
  const { data } = res;
  // data.dmFee → { required: boolean, fee: number, hasFreeAccess: boolean }
  // data.participants → [{ participant: { username, avatarImageUrl, ... } }]
  if (data.dmFee.hasFreeAccess) {
    // User is whitelisted — show "Free access (normally X DHB)" badge
  }
});

// 3. Send a message
socket.emit('sendMessage', {
  dmId: conversationId,
  content: 'Hello!',
  type: 'msg',
  txHash: feeRequired ? txHash : undefined,  // per-message fee — can send IMMEDIATELY after submitting tx
});

// 3b. Send a message with a voluntary tip attached
//     Works even if the creator has NO per-message fee.
//     Uses `tipTxHash` instead of `txHash`.
//     Receiver won't see the message until the tip confirms on-chain.
const tipTxHash = await sendTipOnChain(recipientAddress, tipAmount);
socket.emit('sendMessage', {
  dmId: conversationId,
  content: 'Loved your content!',
  type: 'msg',                   // can also be 'gif', 'media', 'voice'
  tipTxHash,                     // voluntary tip — can send IMMEDIATELY after submitting tx
});

// 4. Listen for incoming messages
socket.on('sendMessage', (msg) => {
  if (msg.author === 'other') {
    // New message from the other user
  }
  if (msg.author === 'me' && msg.paymentStatus === 'pending') {
    // Your message is awaiting on-chain confirmation (per-message fee OR tip)
    // Show a "confirming payment..." indicator on this message
  }
  // Tip-attached messages include tipAmount / tipSymbol once confirmed
  if (msg.tipAmount && msg.msgType !== 'tip') {
    // This is a regular message with a voluntary tip attached
    // Show a tip badge: "Tipped 500 DHB" alongside the message content
  }
});

// 5. Edit a message
socket.emit('editMessage', {
  dmId: conversationId,
  messageId: messageId,
  content: 'Updated text',
});

socket.on('editMessage', (data) => {
  // Update message in UI, show "edited" tag
});

// 6. Reply to a message
socket.emit('sendMessage', {
  dmId: conversationId,
  content: 'Great point!',
  type: 'msg',
  replyTo: originalMessageId,   // ID of the message being replied to
});

socket.on('sendMessage', (msg) => {
  if (msg.replyTo) {
    // Render reply preview bubble above the message
    // msg.replyTo.sender.username — who wrote the original
    // msg.replyTo.content — truncated preview text
    // msg.replyTo.mediaUrls[0] — thumbnail (if media)
  }
});

// 7. Forward a message
socket.emit('forwardMessage', {
  messageId: originalMessageId,
  targetDmId: targetConversationId,
  txHash: feeRequired ? txHash : undefined,
});

socket.on('forwardMessage', (msg) => {
  // Show forwarded message with "forwarded" tag
});

// 8. Send a voice note
socket.emit('sendMessage', {
  dmId: conversationId,
  content: '',
  type: 'voice',
  voiceDuration: 30,  // duration in seconds
});

// 9. Read receipts
socket.emit('readReceipt', { dmId: conversationId });
socket.on('readReceipt', (receipt) => {
  // Update read status for messages
});

// 10. Handle errors
socket.on('error', (err) => {
  switch (err.code) {
    case 'DM_FEE_REQUIRED':
      // Prompt user to pay fee (err.fee has the amount)
      break;
    case 'BLOCKED':
      // Show blocked state
      break;
  }
});

// 11. Handle payment confirmations (per-message fee)
socket.on('feeConfirmed', (data) => {
  // data = { messageId, conversationId, txHash, amount, status: 'confirmed' }
  // Update the pending message in your local state:
  //   paymentStatus: 'pending' → 'confirmed'
  // Remove the "confirming payment..." indicator from the message
});

// 12. Send a tip (fire-and-forget — no need to wait for confirmation)
const txHash = await sendTipOnChain(recipientAddress, amount);
const tipRes = await fetch('/dm/tip-notify', {
  method: 'POST',
  headers: { ...authHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({ txHash, conversationId, senderAddress: myAddress }),
});
// Response:
//   201 → tip confirmed. data.tipMessage has the populated message.
//   202 → tip pending. data.tipMessage has the pending message (sender-only).
//   Both include a tipMessage object that arrives via sendMessage socket event.
// The tip message will also arrive via the `sendMessage` socket event,
// so no need to manually insert it — just listen for new messages.

// 13. Render tip messages in the conversation
socket.on('sendMessage', (msg) => {
  if (msg.msgType === 'tip') {
    // This is an inline tip message — render it as a system-style bubble:
    //   msg.author === 'me'    → "You tipped 10,000 DHB"
    //   msg.author === 'other' → "Alice tipped you 10,000 DHB"
    //
    // msg.tipAmount  — the verified tip amount (null while pending)
    // msg.tipSymbol  — token symbol, e.g. 'DHB' (null while pending)
    //
    // If msg.paymentStatus === 'pending' && msg.author === 'me':
    //   Show "Confirming tip..." spinner (receiver won't see it yet)
    // If msg.paymentStatus === 'confirmed':
    //   Show the full tip amount and symbol
  }
  // ... handle normal messages
});
```

### REST examples

```typescript
// Load contacts
const contacts = await fetch(`/dm/contacts/${myAddress}`, { headers: authHeaders });

// Search users
const users = await fetch(`/dm/search?searchQuery=john`, { headers: authHeaders });

// Upload media message
const form = new FormData();
form.append('conversationId', conversationId);
form.append('senderId', myAddress);
form.append('files', file1);
form.append('files', file2);
const uploaded = await fetch('/dm/upload', {
  method: 'POST',
  headers: authHeaders,
  body: form,
});

// Upload voice note
const voiceForm = new FormData();
voiceForm.append('conversationId', conversationId);
voiceForm.append('senderId', myAddress);
voiceForm.append('msgType', 'voice');
voiceForm.append('voiceDuration', '30');
voiceForm.append('files', audioBlob, 'voice.m4a');
const voiceResult = await fetch('/dm/upload', {
  method: 'POST',
  headers: authHeaders,
  body: voiceForm,
});

// Set per-message fee
await fetch(`/dm/user-status/${myAddress}`, {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({ perMessageFee: 5 }),
});

// Manage free access
await fetch('/dm/free-access', {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({ address: friendAddress }),
});
```

### UI recommendations

- Show **"edited"** tag on messages where `isEdited === true`
- Show **"forwarded"** tag on messages where `isForwarded === true`
- Show **reply preview bubble** above messages where `replyTo !== null` — display sender name + content snippet / media thumbnail (see [Reply-To UI recommendations](#message-reply-reply-to))
- Show **audio player / waveform** for messages where `msgType === 'voice'` with duration from `voiceDuration`
- Show **tip message bubble** for `msgType === 'tip'` — render as a distinctive system-style message (e.g. centered, accent-colored) showing the amount and token symbol:
  - `author === 'me'` → **"You tipped 10,000 DHB"**
  - `author === 'other'` → **"Alice tipped you 10,000 DHB"** (use `sender.displayName` or `sender.username`)
  - While `paymentStatus === 'pending'`: show **"Confirming tip..."** with a spinner (only the sender sees this)
  - `tipAmount` and `tipSymbol` are `null` while pending — use local knowledge of the submitted amount if you want, or just show the spinner
  - Tip messages cannot be edited, deleted, forwarded, or replied-to
- Show **tip badge on regular messages** when `tipAmount` is set AND `msgType !== 'tip'` — this is a tipped message (regular content + voluntary tip). Render the normal content plus a tip overlay/accent (e.g. "Tipped 500 DHB"):
  - While `paymentStatus === 'pending'`: show **"Confirming tip..."** (sender-only, receiver won't see the message at all yet)
  - Once confirmed: show the tip amount alongside the normal message content
- Show **unread badge** on each conversation using `unreadCount` from the contacts response
- Show **"Free access"** badge when `dmFee.hasFreeAccess === true` (optionally display the normal fee: "Free access · normally 5 DHB")
- Check `dmFee.required` from `createAndStart` response to show fee prompt
- Display conversation tip rankings from `tips` array in contacts response
- Use `readReceipt` events for real-time read indicators (double-check marks)
- Use `downloadReceipt` events for media download indicators
- Enforce client-side file size limits: images ≤ 10 MB, videos ≤ 50 MB, voice ≤ 2 MB / 60s
- Enforce client-side message content limit: **5,000 characters** for text messages
- Messages now include full `sender` object: `{ _id, username, address, displayName, avatarImageUrl }`
- Messages now include `replyTo` field: either `null` or a [ReplyPreview](#reply-preview-shape) object

### Pending payment messages (per-message fee)

When a creator has a per-message fee, the sender's message goes through a
**pending → confirmed** lifecycle. The frontend should handle this:

```typescript
// When rendering a message:
if (msg.paymentStatus === 'pending') {
  // Show a subtle "Confirming payment..." indicator (spinner, clock icon, etc.)
  // The message is ONLY visible to the sender at this point
  // The receiver will NOT see it until confirmed
}

if (msg.paymentStatus === 'confirmed' || msg.paymentStatus === null) {
  // Normal message — no special indicator needed
}

// Listen for confirmation:
socket.on('feeConfirmed', (data) => {
  // Find the message by data.messageId in your local state
  // Update paymentStatus from 'pending' to 'confirmed'
  // Remove the "confirming" indicator
});
```

**Key points for the frontend:**
- **No waiting required** — submit the on-chain tx and immediately send the message with `txHash`. The backend handles the rest.
- **Pending messages auto-expire** — if the on-chain tx never confirms (e.g., insufficient gas), the pending message is automatically deleted after 10 minutes. The sender should see the message disappear or show a "Payment failed" state.
- **Receiver never sees unconfirmed messages** — the receiver's message list, unread count, and push notifications all exclude pending-payment messages.
- **`tipNotify` and `verifyDmFee` also support pending** — these REST endpoints return HTTP 202 when the tx isn't confirmed yet. No need to poll — the webhook handles confirmation automatically.
