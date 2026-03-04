# LiveChat Module — Global Chat System

## Overview

The LiveChat module provides a **real-time global chat room** for all platform users. It uses WebSocket (Socket.IO) for real-time messaging and REST endpoints for data fetching and moderation. Only a single global room exists — there are no per-token, per-stream, or topic rooms.

### Key Features

- **Real-time messaging** via Socket.IO (`/livechat` namespace)
- **User reference details** — every message includes full sender profile (username, displayName, avatar, followers, badge, etc.)
- **Badge system** based on DHB staked amount (Bronze → Diamond)
- **Moderator system** — admins appoint mods who can ban users, delete/pin messages, enable slow mode
- **Admin dashboard endpoints** for full room management (view messages, participants, manage mods/bans)
- **Ban awareness** — banned users are clearly notified on connect, join, and message attempt (with `BANNED` error code)
- **Media & GIF** support (images, Giphy/Tenor)
- **Reactions** (emoji-based, per-message)
- **Reply threading** with content preview
- **Mentions** (@username)
- **Slow mode** (configurable cooldown between messages)
- **Minimum stake gate** (require DHB staked to participate)
- **Cursor-based pagination** for message history
- **Redis-backed** presence tracking & slow-mode enforcement (db 3)
- **Admin read-only** — admins can view and delete messages but cannot send them

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Clients (Mobile / Web)                                  │
│  Socket.IO: ws://host/livechat?address=0x...             │
└────────────────────┬─────────────────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │  LiveChatGateway        │   WebSocket handlers
        │  (livechat.gateway.ts)  │   join, send, react, type, ping
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────┐
        │  LiveChatService        │   Business logic
        │  (livechat.service.ts)  │   MongoDB + Redis operations
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────────────────────┐
        │  MongoDB                 Redis (db 3)   │
        │  • LiveChatRoom          • Presence      │
        │  • LiveChatMessage       • Slow-mode     │
        │                          • User cache    │
        │                          • Online count  │
        └─────────────────────────────────────────┘
```

### Files

| File | Purpose |
|------|---------|
| `models/livechat/livechat-room.ts` | Room schema (global config, mods, bans) |
| `models/livechat/livechat-message.ts` | Message schema (content, reactions, pins) |
| `src/livechat/livechat.types.ts` | Events, interfaces, badge logic |
| `src/livechat/livechat.service.ts` | Core business logic |
| `src/livechat/livechat.gateway.ts` | Socket.IO gateway |
| `src/livechat/livechat.controller.ts` | REST endpoints (public + mod) |
| `src/livechat/livechat.module.ts` | NestJS module (auto-creates global room) |
| `src/admin/admin-livechat.controller.ts` | Admin dashboard endpoints |

---

## Database Models

### LiveChatRoom

Single document with `roomId: 'global'`.

| Field | Type | Description |
|-------|------|-------------|
| `roomId` | string | Always `'global'` (unique index) |
| `name` | string | Display name |
| `description` | string | Optional description |
| `isActive` | boolean | Whether chat is enabled |
| `messageCount` | number | Total messages sent |
| `lastMessageAt` | Date | Timestamp of last message |
| `slowMode` | boolean | Whether slow mode is active |
| `slowModeSeconds` | number | Cooldown in seconds (default: 5) |
| `minStakeRequired` | number | Minimum DHB staked to chat |
| `moderators` | string[] | Wallet addresses with mod privileges |
| `bannedUsers` | string[] | Wallet addresses banned from chatting |

### LiveChatMessage

| Field | Type | Description |
|-------|------|-------------|
| `roomId` | string | Always `'global'` |
| `sender` | ObjectId | Ref to Account |
| `senderAddress` | string | Wallet address (indexed) |
| `content` | string | Message text (max 500 chars) |
| `messageType` | enum | `text`, `media`, `gif`, `system` |
| `systemType` | enum | `announcement`, `milestone` (system only) |
| `media` | array | Image attachments |
| `gif` | object | Giphy/Tenor GIF data |
| `replyTo` | ObjectId | Parent message ID |
| `replyToContent` | string | Preview of replied message |
| `replyToSenderAddress` | string | Address of replied-to sender |
| `mentions` | array | `{ address, username }` pairs |
| `reactions` | Map | `{ emoji: [addresses] }` |
| `isPinned` | boolean | Whether message is pinned |
| `pinnedBy` | string | Address/role that pinned it |
| `pinnedAt` | Date | When it was pinned |
| `isDeleted` | boolean | Soft delete flag |
| `deletedBy` | string | Who deleted it |
| `deletedAt` | Date | When it was deleted |

**Indexes:** `(roomId, createdAt)`, `(roomId, isPinned)`, `(senderAddress, createdAt)`, `isDeleted`

## WebSocket API

**Namespace:** `/livechat`
**Connection:** `io('/livechat', { auth: { token: 'jwt...' } })`

Authentication uses the same JWT token as the rest of the platform (obtained via login/signature). The token is passed via:
- `auth.token` (preferred)
- `query.token`
- `Authorization: Bearer ...` header

The server verifies the JWT and extracts the user's wallet address — no raw address query param.

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `livechat:joinRoom` | *(none)* | Join the global chat room |
| `livechat:leaveRoom` | *(none)* | Leave the room |
| `livechat:sendMessage` | `SendMessagePayload` | Send a message |
| `livechat:editMessage` | `{ messageId, content }` | Edit your own message |
| `livechat:deleteMessage` | `{ messageId }` | Delete message (owner or mod) |
| `livechat:addReaction` | `{ messageId, emoji }` | React to a message |
| `livechat:removeReaction` | `{ messageId, emoji }` | Remove your reaction |
| `livechat:typing` | `{ isTyping: boolean }` | Typing indicator |
| `livechat:ping` | *(none)* | Keep-alive ping |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `livechat:roomJoined` | `{ room, messages, yourUser, isBanned, canSendMessages }` | Emitted after join with room info + last 50 messages + ban status |
| `livechat:roomLeft` | `{ roomId }` | Confirms you left |
| `livechat:newMessage` | `LiveChatMessageResponse` | New message in room |
| `livechat:messageEdited` | `LiveChatMessageResponse` | A message was edited |
| `livechat:messageDeleted` | `{ messageId, deletedBy, timestamp }` | A message was deleted |
| `livechat:reactionUpdated` | `{ messageId, reactions, action, emoji, user }` | Reaction added/removed |
| `livechat:userTyping` | `{ user, isTyping }` | Someone is typing |
| `livechat:userJoined` | `{ user, timestamp }` | User came online |
| `livechat:userLeft` | `{ user, timestamp }` | User went offline |
| `livechat:roomUpdated` | `LiveChatRoomResponse` | Settings changed |
| `livechat:messagePinned` | `LiveChatMessageResponse` | Message pinned |
| `livechat:messageUnpinned` | `{ messageId }` | Message unpinned |
| `livechat:userBanned` | `{ message }` | You were banned (sent to specific sockets) |
| `livechat:userUnbanned` | `{ message }` | You were unbanned |
| `livechat:error` | `{ message, code?, isBanned? }` | Error occurred. `code: 'BANNED'` when user is banned and tries to send |
| `livechat:pong` | `{ timestamp }` or `{ connected, socketId, isAuthenticated, user, isBanned }` | Ping/connection response — initial connection includes ban status and `isModerator` |

### SendMessagePayload

```typescript
{
  content?: string;        // Text content (max 500 chars)
  messageType?: 'text' | 'media' | 'gif';
  media?: {
    url: string;
    type: 'image' | 'gif';
    mimeType?: string;
    width?: number;
    height?: number;
    thumbnailUrl?: string;
  }[];
  gif?: {
    provider: 'giphy' | 'tenor';
    gifId: string;
    url: string;
    previewUrl: string;
    width: number;
    height: number;
  };
  replyTo?: string;        // Message ID to reply to
  mentions?: { address: string; username?: string }[];
}
```

---

## REST API

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/livechat/room` | Get room info (name, online count, mods, banned list, pinned) |
| `GET` | `/livechat/messages` | Paginated messages with user refs (`?before=`, `?after=`, `?limit=`) |
| `GET` | `/livechat/user/:address` | Get user chat profile (badgeBalance, mod status, ban status) |
| `GET` | `/livechat/online` | Get online user count |
| `GET` | `/livechat/status` | **Auth required.** Get your ban/mod status and whether you can send messages |

### Moderator Endpoints (requires auth + mod status)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/livechat/mod/ban` | Ban a user `{ address }` |
| `DELETE` | `/livechat/mod/ban/:userAddress` | Unban a user |
| `POST` | `/livechat/mod/pin/:messageId` | Pin a message (max 5) |
| `DELETE` | `/livechat/mod/pin/:messageId` | Unpin a message |
| `DELETE` | `/livechat/mod/message/:messageId` | Delete any message |

### Admin Dashboard Endpoints

All admin endpoints require `AdminJwtAuthGuard` + `AdminRoleGuard`.

**Important:** Admins can view and delete messages but **cannot send messages** in the chat. They can assign moderators who participate as regular users with mod privileges.

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/admin/livechat` | All | Overview (room, mods, banned, online addresses) |
| `PATCH` | `/admin/livechat/settings` | SUPER_ADMIN, ADMIN | Update slow mode, stake gate |
| `GET` | `/admin/livechat/moderators` | All | List moderators with user reference profiles |
| `POST` | `/admin/livechat/moderators` | SUPER_ADMIN, ADMIN | Add moderator `{ address }` |
| `DELETE` | `/admin/livechat/moderators/:address` | SUPER_ADMIN, ADMIN | Remove moderator |
| `GET` | `/admin/livechat/banned` | All | List banned users with profiles |
| `POST` | `/admin/livechat/ban` | SUPER_ADMIN, ADMIN, MOD | Ban user `{ address }` — user is notified in real-time |
| `DELETE` | `/admin/livechat/ban/:address` | SUPER_ADMIN, ADMIN, MOD | Unban user — user is notified in real-time |
| `GET` | `/admin/livechat/participants` | All | **Paginated participants** with user refs, msg count, online status |
| `GET` | `/admin/livechat/messages` | All | **Messages with deleted** + user refs (`?senderAddress=`, `?includeDeleted=`) |
| `DELETE` | `/admin/livechat/messages/:messageId` | SUPER_ADMIN, ADMIN, MOD | Delete message |
| `POST` | `/admin/livechat/pin/:messageId` | SUPER_ADMIN, ADMIN, MOD | Pin message |
| `DELETE` | `/admin/livechat/pin/:messageId` | SUPER_ADMIN, ADMIN, MOD | Unpin message |

#### Admin Settings Body

```json
{
  "slowMode": true,
  "slowModeSeconds": 10,
  "minStakeRequired": 1000
}
```

---

## Redis Keys (db 3)

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `livechat:room:global:users` | Hash | — | `{ address: socketId }` currently online |
| `livechat:room:global:count` | String | — | Online user count (incr/decr) |
| `livechat:sockets:{address}` | Hash | — | `{ socketId: timestamp }` per user (multi-tab) |
| `livechat:slowmode:global:{address}` | String | slowModeSeconds | Slow mode cooldown |
| `livechat:user-cache:{address}` | String | 300s | Cached user profile JSON |

---

## Moderation Privileges

### Moderators (appointed by admins) can:
- Ban / unban users from chat
- Delete any message
- Pin / unpin messages (max 5 pinned)

### Admins (via dashboard) can additionally:
- Add / remove moderators
- Update room settings (slow mode, stake gate)
- View all messages including deleted (audit)
- View participants with online/offline status and message counts
- Filter participants by status (online, banned, moderators)
- Search participants by username, displayName, or address
- Override moderator actions
- **Cannot send messages** — admin panel is read-only for chat content

---

## Frontend Integration Guide

### 1. Connect

```typescript
import { io } from 'socket.io-client';

const socket = io(`${API_BASE}/livechat`, {
  auth: { token: userJwtToken },  // same JWT from login
  transports: ['websocket'],
});

socket.on('livechat:pong', (data) => {
  if (data.connected) {
    console.log('Connected, user:', data.user);
    if (data.isBanned) {
      showBanNotice('You are banned from chat');
    }
    if (data.user?.isModerator) {
      showModTools();
    }
    socket.emit('livechat:joinRoom');
  }
});
```

### 2. Join & Receive Initial Data

```typescript
socket.on('livechat:roomJoined', ({ room, messages, yourUser, isBanned, canSendMessages }) => {
  // room: LiveChatRoomResponse (settings, mods, pinned, banned list)
  // messages: last 50 messages (each includes full sender user ref)
  // yourUser: your profile + badge
  // isBanned: whether you are banned
  // canSendMessages: false if banned
  if (!canSendMessages) {
    disableChatInput('You are banned from chat');
  }
});
```

### 3. Send Messages

```typescript
socket.emit('livechat:sendMessage', {
  content: 'Hello world!',
  mentions: [{ address: '0x...', username: 'alice' }],
  replyTo: 'messageId123',  // optional
});

socket.on('livechat:newMessage', (message) => {
  // Append to chat UI
});
```

### 4. Load More Messages

```typescript
// REST call for older messages
const res = await fetch(`/livechat/messages?before=${oldestMessageId}&limit=50`);
const { messages, hasMore } = await res.json();
```

### 5. Reactions

```typescript
socket.emit('livechat:addReaction', { messageId: 'abc', emoji: '🔥' });
socket.on('livechat:reactionUpdated', ({ messageId, reactions }) => {
  // Update reaction display
});
```

### 6. Handle Errors & Bans

```typescript
socket.on('livechat:error', ({ message, code, isBanned }) => {
  if (code === 'BANNED') {
    // User tried to send while banned — disable input permanently
    disableChatInput(message);
  } else {
    showToast(message); // e.g. "Slow mode: wait 5s"
  }
});

socket.on('livechat:userBanned', ({ message }) => {
  // User was just banned — disable chat immediately
  disableChatInput(message);
});

socket.on('livechat:userUnbanned', ({ message }) => {
  // User was unbanned — re-enable chat
  enableChatInput();
  showToast(message);
});
```

### 7. Check Status via REST

```typescript
// Useful on app launch / reconnect to show correct UI
const res = await fetch('/livechat/status', { headers: { Authorization: `Bearer ${token}` } });
const { isBanned, isModerator, canChat } = await res.json();
if (isBanned) disableChatInput('You are banned from chat');
if (isModerator) showModTools();
```

---

## User Reference Details

Every message sender includes full user reference data:

```typescript
{
  address: '0x1234...',
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: 'https://cdn.example.com/avatars/alice.jpg',
  isModerator: true,
  isBanned: false,
  followers: 1250,
  followings: 340,
  badgeBalance: 150000,
  accountCreatedAt: '2024-01-15T10:30:00.000Z',
}
```

The frontend derives the badge tier (Bronze, Silver, Gold, etc.) from `badgeBalance` using the thresholds above. `isModerator` is included so the frontend can show mod badges or tools inline without additional lookups.

---

## Performance Notes

- **User info cached** in Redis for 5 min — avoid repeated Account + Balance lookups
- **Single global room** — no room enumeration queries
- **Lean queries** throughout for read paths
- **Redis presence** — O(1) online count via counter key
- **Cursor pagination** — uses `_id` cursors, not skip/limit
- **Max 100 messages per page** to bound response size
- **Slow mode enforced via Redis TTL** — no polling
- **Message content capped at 500 chars**
- **Max 5 pinned messages** per room
