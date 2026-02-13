# Livestream Frontend Integration Guide

## Overview

The livestream system uses a **single-endpoint flow** where creating a livestream and minting the NFT happen in one API call (`POST /nft/user_mint`). The stream then transitions through status changes driven by **Livepeer webhooks** — the frontend does not manually start/stop the stream via API.

---

## Stream Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│  1. Creator fills form (title, description, thumbnail, etc.)     │
│  2. POST /nft/user_mint  (postType=live, with stream settings)   │
│     → Returns: mint signature + stream entity                    │
│  3. Frontend sends on-chain mint transaction                     │
│  4. Navigate to producer page with stream data                   │
│  5. Connect WHIP (WebRTC) to Livepeer ingest URL                │
│  6. Livepeer sends webhook → stream.started → status = LIVE     │
│  7. Creator ends stream via socket or stops WHIP                 │
│  8. Livepeer sends webhook → stream.idle → status = ENDED       │
└──────────────────────────────────────────────────────────────────┘
```

### Status Flow

| Status       | Meaning                                           |
| ------------ | ------------------------------------------------- |
| `OFFLINE`    | Stream entity created, not yet broadcasting       |
| `SCHEDULED`  | Stream scheduled for a future date                |
| `LIVE`       | Livepeer is receiving video data from the creator  |
| `PAUSED`     | Streamer's connection dropped; grace period active (90s) |
| `ENDED`      | Stream has ended (terminal state)                 |

> **Important:** The transition from `OFFLINE` → `LIVE` and `LIVE` → `ENDED` is driven by Livepeer webhooks, NOT by frontend API calls. The frontend should listen for socket events to react to these transitions.
>
> **Grace Period:** When Livepeer fires `stream.idle` (streamer disconnects), the backend transitions to `PAUSED` instead of immediately ending. A 90-second grace period starts. If the streamer reconnects (`stream.started` webhook), the stream resumes to `LIVE`. If the grace period expires, the stream transitions to `ENDED`. The frontend receives `stream.paused` and `stream.resumed` socket events.

---

## API Reference

### 1. Create Livestream (Combined Mint + Create)

**`POST /nft/user_mint`** — multipart/form-data

This is the same endpoint used for all content types. When `postType=live`, it additionally creates the Livepeer stream entity.

#### Request Body (FormData)

| Field           | Type     | Required | Description                                       |
| --------------- | -------- | -------- | ------------------------------------------------- |
| `postType`      | string   | ✅       | Must be `"live"`                                   |
| `title`         | string   | ✅       | Stream title                                       |
| `description`   | string   | ❌       | Stream description                                 |
| `thumbnail`     | File     | ❌       | Thumbnail image file                               |
| `categories`    | string   | ❌       | JSON array of category names, e.g. `'["Gaming"]'`  |
| `settings`      | string   | ❌       | JSON object: `'{"enableChat":true,"minTip":1000}'` |
| `scheduledFor`  | string   | ❌       | ISO date string for scheduled streams              |
| `streamDelay`   | number   | ❌       | Stream delay in seconds (default: 0)               |
| `streamInfo`    | string   | ❌       | JSON object with additional stream metadata        |
| `tokenId`       | number   | ✅       | The on-chain token ID (from mint parameters)       |
| `chain`         | string   | ✅       | Target blockchain (e.g., `"base"`)                 |
| `price`         | string   | ❌       | Price for PPV (if applicable)                      |
| ...             | ...      | ...      | Other standard mint fields                         |

#### Response

```json
{
  "signature": "0x...",
  "tokenId": 123,
  "price": "0",
  "uri": "ipfs://...",
  "deadline": 1234567890,
  "stream": {
    "_id": "6507...",
    "tokenId": 123,
    "playbackId": "abcd1234",
    "streamKey": "stream-key-xxx",
    "livepeerId": "livepeer-id-xxx",
    "status": "OFFLINE",
    "ingestUrl": "https://playback.livepeer.studio/webrtc/abcd1234"
  }
}
```

#### Frontend Implementation

```typescript
// 1. Build form data
const formData = new FormData();
formData.append('postType', 'live');
formData.append('title', streamTitle);
formData.append('description', streamDescription);
formData.append('categories', JSON.stringify(selectedCategories));
formData.append('settings', JSON.stringify({ enableChat: true, minTip: 1000 }));
if (thumbnailFile) formData.append('thumbnail', thumbnailFile);
if (scheduledDate) formData.append('scheduledFor', scheduledDate.toISOString());
formData.append('streamDelay', String(streamDelay || 0));
// ... other mint fields (chain, price, etc.)

// 2. Call the combined endpoint
const response = await api.post('/nft/user_mint', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});

const { signature, tokenId, stream } = response.data;

// 3. Execute on-chain mint transaction
await mintOnChain(signature, tokenId, ...);

// 4. Navigate to producer page
navigate(`/live/producer/${stream._id}`, {
  state: {
    streamKey: stream.streamKey,
    playbackId: stream.playbackId,
    ingestUrl: stream.ingestUrl,
  },
});
```

---

### 2. Get Stream Details

**`GET /live/:streamId`**

Returns full stream data with streamer account info and recent activities.

#### Response

```json
{
  "_id": "6507...",
  "title": "My Stream",
  "description": "...",
  "thumbnail": "https://cdn.example.com/live/thumbnails/6507.jpg",
  "status": "LIVE",
  "playbackId": "abcd1234",
  "livepeerId": "...",
  "address": "0x...",
  "tokenId": 123,
  "likes": 42,
  "totalViews": 150,
  "peakViewers": 80,
  "totalTips": 5000,
  "duration": 3600,
  "startedAt": "2024-01-01T00:00:00Z",
  "categories": ["Gaming"],
  "settings": { "chat": { "enabled": true }, "minTip": 1000 },
  "streamDelay": 0,
  "streamInfo": {},
  "activities": [ /* last 100 activities */ ],
  "account": {
    "address": "0x...",
    "username": "streamer",
    "displayName": "Cool Streamer",
    "avatarImageUrl": "https://...",
    "followers": 1000,
    "followings": 50,
    "badgeBalance": 5
  }
}
```

---

### 3. Get Active Streams List

**`GET /live`**

Returns all non-ended streams (LIVE, SCHEDULED, OFFLINE) sorted by `startedAt` descending.

Query parameters: none (default limit=20, offset=0).

---

### 4. Get User's Streams

**`GET /live/user/:address`** — All streams by a user  
**`GET /live/user/:address/scheduled`** — Scheduled streams only

Query params for scheduled: `?limit=20&offset=0&futureOnly=true`

---

### 5. Get Stream Key (Owner Only)

**`GET /live/:streamId/key`** — Requires auth, must be stream owner.

```json
{ "streamKey": "stream-key-xxx" }
```

---

### 6. Get Ingest URL (Owner Only)

**`GET /live/:streamId/ingesturl`** — Requires auth, must be stream owner.

```json
{ "ingestUrl": "https://playback.livepeer.studio/webrtc/abcd1234" }
```

---

### 7. Like a Stream

**`POST /live/:streamId/like`** — Requires auth.

Works on streams that are NOT ended (LIVE, OFFLINE, or SCHEDULED). Each user can like once.

---

### 8. Send a Tip/Gift

**`POST /live/:streamId/gift`** — Requires auth. Stream must be LIVE.

#### Request Body

```json
{
  "transactionHash": "0x...",
  "tokenId": "...",
  "amount": 5000,
  "recipient": "0xStreamerAddress",
  "tokenAddress": "0xTokenContract",
  "message": "Great stream!",
  "selectedTier": "gold",
  "timestamp": 1704067200
}
```

---

### 9. Stream Activities

**`GET /live/:streamId/activities`**

Returns all activities (chat messages, tips, joins, likes, etc.) sorted chronologically.

---

### 10. Update Stream Settings (Owner Only)

**`PATCH /live/:streamId/settings`** — Requires auth, must be stream owner. Stream must be LIVE.

#### Request Body

```json
{
  "settings": {
    "chat": { "enabled": false },
    "minTip": 5000
  }
}
```

Settings are **merged** (shallow) with existing settings. All connected viewers receive a `stream.settings.update` socket event in real-time.

---

### 11. Livepeer Webhook

**`POST /live/webhook`** — Called by Livepeer, not the frontend.

> **Security:** If `LIVEPEER_WEBHOOK_SECRET` is set, the backend verifies the `livepeer-signature` header using HMAC SHA256. Invalid signatures are rejected with `401`.

---

## WebSocket Events

Connect to the WebSocket server with auth:

```typescript
import { io } from 'socket.io-client';

const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  auth: {
    user: { address: userAddress, username: userName },
  },
});
```

> **Note:** Authentication is optional for joining rooms (`stream.join.room`). Anonymous viewers can watch streams and receive events without providing auth. However, sending chat messages, reactions, tips, and registering as an active viewer (`stream.join`) all require authentication.

### Events to EMIT (Client → Server)

| Event              | Payload                                  | Description                    |
| ------------------ | ---------------------------------------- | ------------------------------ |
| `stream.join.room` | `{ streamId }`                           | Join the socket room (required before receiving events). **No auth required.** |
| `stream.join`      | `{ streamId }`                           | Register as an active viewer (requires auth) |
| `stream.left`      | `{ streamId }`                           | Leave the stream               |
| `stream.end`       | `{ streamId }`                           | End the stream (owner only)    |
| `stream.message`   | `{ streamId, content }`                  | Send a chat message (max 500 chars, trimmed) |
| `stream.reaction`  | `{ streamId, type }`                     | Send a reaction (see types below) |
| `heartbeat`        | (none)                                   | Keep connection alive          |

#### Reaction Types

Valid values for `stream.reaction` → `type`:

| Type          | Usage                    |
| ------------- | ------------------------ |
| `LIKE`        | Thumbs up / like         |
| `HEART`       | Heart / love             |
| `CELEBRATE`   | Party / celebration      |
| `SUPPORT`     | Fist bump / support      |
| `LAUGH`       | Laughing / funny         |

### Events to LISTEN (Server → Client)

| Event                      | Payload                                         | Description                       |
| -------------------------- | ----------------------------------------------- | --------------------------------- |
| `stream.start`             | `{ streamId, status, startedAt }`               | Stream went LIVE (from webhook)   |
| `stream.end`               | `{ streamId, status, endedAt, duration }`       | Stream ended (via socket, REST, or webhook) |
| `stream.join`              | `{ viewerCount, user: { address, username } }`  | A viewer joined                   |
| `stream.left`              | `{ viewerCount, user: { address, username } }`  | A viewer left                     |
| `stream.viewers.update`    | `{ viewerCount }`                               | Viewer count changed              |
| `stream.like`              | `{ likes }`                                     | Someone liked the stream          |
| `streamer.tip`             | `{ gift: { address, amount, message, ... } }`   | Someone tipped the streamer       |
| `stream.message`           | `{ message: { content, user, ... } }`           | Chat message received             |
| `stream.reaction`          | `{ streamId, type, user: { address, username } }` | A viewer sent a reaction        |
| `stream.settings.update`   | `{ streamId, settings }`                        | Stream settings changed by owner  |
| `stream.paused`            | `{ streamId }`                                  | Stream temporarily paused         |
| `stream.resumed`           | `{ streamId }`                                  | Stream resumed after pause        |
| `stream.user.banned`       | `{ streamId, address }`                         | A user was banned from stream     |
| `stream.user.muted`        | `{ streamId, address }`                         | A user was muted in stream        |
| `stream.error`             | `{ streamId, message }`                         | Stream error occurred             |
| `heartbeat`                | `{ clientId, address, serverTs }`               | Heartbeat echo                    |
| `update-online-users`      | `string[]`                                      | Array of online user addresses    |

---

## Producer Page Flow (Streamer)

```typescript
// 1. After mint, you have stream data from the response
const { _id: streamId, streamKey, playbackId, ingestUrl } = stream;

// 2. Connect socket and join room
socket.emit('stream.join.room', { streamId });

// 3. Connect WHIP (WebRTC) to Livepeer
// Use the ingestUrl from the response, or fetch it:
// GET /live/:streamId/ingesturl
const whipUrl = ingestUrl; // e.g. https://playback.livepeer.studio/webrtc/{playbackId}

// Use a WHIP client (e.g., @livepeer/webrtc) to push video
const pc = new RTCPeerConnection();
// ... add tracks, create offer, POST to whipUrl ...

// 4. Listen for stream.start event (Livepeer webhook fires when video arrives)
socket.on('stream.start', (data) => {
  // Stream is now LIVE — update UI
  setStreamStatus('LIVE');
});

// 4b. Listen for reactions
socket.on('stream.reaction', (data) => {
  // data = { streamId, type, user: { address, username } }
  // Show reaction animation overlay
});

// 5. Update settings while live (e.g. toggle chat)
await api.patch(`/live/${streamId}/settings`, {
  settings: { chat: { enabled: false } },
});
// All viewers will receive stream.settings.update automatically

// 6. To end the stream
socket.emit('stream.end', { streamId });
// OR just stop the WHIP connection — Livepeer will fire stream.idle webhook

// 7. Listen for stream.end confirmation
socket.on('stream.end', (data) => {
  setStreamStatus('ENDED');
  // Navigate to VOD/recap page
});
```

---

## Viewer Page Flow

```typescript
// 1. Fetch stream details
const stream = await api.get(`/live/${streamId}`);

// 2. Connect socket and join room (no auth needed to watch)
socket.emit('stream.join.room', { streamId });
socket.emit('stream.join', { streamId }); // requires auth — registers as active viewer

// 3. Play HLS video
// Playback URL: https://livepeercdn.studio/hls/{playbackId}/index.m3u8
const hlsUrl = `https://livepeercdn.studio/hls/${stream.playbackId}/index.m3u8`;

// 4. Listen for real-time events
socket.on('stream.message', (data) => { /* add to chat */ });
socket.on('stream.like', (data) => { /* update like count */ });
socket.on('streamer.tip', (data) => { /* show tip animation */ });
socket.on('stream.viewers.update', (data) => { /* update viewer count */ });
socket.on('stream.end', (data) => { /* show ended state */ });
socket.on('stream.reaction', (data) => {
  // data = { streamId, type, user: { address, username } }
  // Show floating reaction animation
});
socket.on('stream.settings.update', (data) => {
  // data = { streamId, settings }
  // Update UI — e.g. toggle chat visibility, update min tip
});

// 5. Send chat messages (max 500 chars)
socket.emit('stream.message', { streamId, content: 'Hello!' });

// 6. Send a reaction
socket.emit('stream.reaction', { streamId, type: 'HEART' });

// 7. Like the stream (via REST, not socket)
await api.post(`/live/${streamId}/like`);

// 8. On leave
socket.emit('stream.left', { streamId });
```

---

## Scheduled Streams

If `scheduledFor` is set to a future date during creation, the stream starts with status `SCHEDULED`.

- The stream will remain `SCHEDULED` until the creator starts broadcasting via WHIP
- When Livepeer receives video data, the webhook fires `stream.started` → status becomes `LIVE`
- Frontend should show a countdown or "Starts at X" for scheduled streams

---

## Test Streams

Test streams (flagged with `isTest: true`) behave differently:
- When they go idle, status resets to `OFFLINE` instead of `ENDED`
- The Livepeer stream resource is NOT deleted
- This allows the creator to go live again with the same stream entity

---

## Error Handling

| HTTP Code | Scenario                                    |
| --------- | ------------------------------------------- |
| 400       | Missing tokenId, stream not live (for tips), chat message too long |
| 401       | Invalid Livepeer webhook signature          |
| 404       | Stream not found                            |
| 403       | Not authorized (wrong owner for key/ingest) |
| 409       | Already liked this stream                   |

---

## Admin Livestream Endpoints

All admin endpoints require `AdminJwtAuthGuard` authentication. Role restrictions are noted per endpoint.

### List Streams

**`GET /admin/livestreams`**

Query parameters:

| Param      | Type   | Description                                    |
| ---------- | ------ | ---------------------------------------------- |
| `page`     | number | Page number (default: 1)                       |
| `limit`    | number | Items per page (default: 20)                   |
| `status`   | string | Filter by status: `OFFLINE`, `LIVE`, `ENDED`, `SCHEDULED` |
| `address`  | string | Filter by streamer address                     |
| `search`   | string | Search in title (case-insensitive)             |
| `isTest`   | string | `"true"` or `"false"` to filter test streams   |

Returns `{ data: Stream[], total: number, page: number, totalPages: number }`.

### Get Stream Detail

**`GET /admin/livestreams/:id`**

Returns full stream data plus admin-only fields: `isTest`, `isDeleted`, `streamKey`, `livepeerId`, `settings`.

### Toggle Test Flag

**`PATCH /admin/livestreams/:id/test`** — Roles: `SUPER_ADMIN`, `ADMIN`

```json
// Request body
{ "isTest": true }
```

When enabling `isTest` on an `ENDED` stream, the status is automatically reset to `OFFLINE` so it can be reused.

### Force End Stream

**`POST /admin/livestreams/:id/end`** — Roles: `SUPER_ADMIN`, `ADMIN`

Force-ends a stream regardless of ownership. Terminates the Livepeer session and broadcasts `stream.end` to all connected viewers. Only works on `LIVE` or `OFFLINE` streams.

### Soft Delete Stream

**`DELETE /admin/livestreams/:id`** — Roles: `SUPER_ADMIN`, `ADMIN`

Marks the stream as deleted (`isDeleted: true`) and sets status to `ENDED`. Also terminates the Livepeer stream resource.

### Restore Stream

**`PATCH /admin/livestreams/:id/restore`** — Roles: `SUPER_ADMIN`

Restores a soft-deleted stream (`isDeleted: false`).

---

## Key Architecture Notes

1. **No separate createStream endpoint** — Stream creation is handled inside `POST /nft/user_mint` when `postType=live`
2. **Livepeer drives status changes** — The backend receives webhooks from Livepeer (`stream.started`, `stream.idle`) and updates status accordingly. Webhooks are verified with HMAC SHA256 if `LIVEPEER_WEBHOOK_SECRET` is set.
3. **Socket events are broadcast** — All real-time updates go through socket.io rooms (`stream:{streamId}`)
4. **Anonymous viewers supported** — `stream.join.room` does not require authentication, so anyone can watch. Sending messages, reactions, and registering as a viewer require auth.
5. **Chat messages validated** — Messages are trimmed and capped at 500 characters. Empty messages are rejected.
6. **User data uses `userReferenceProjection`** — All user lookups return consistent fields: `address, username, displayName, avatarImageUrl, followers, followings, sentTips, receivedTips, createdAt, isPrivate, hideFollowers, badgeBalance`
7. **Redis tracks viewer counts** — `stream:{streamId}:viewers` key in Redis for fast viewer count reads. Counts are clamped to 0 minimum.
8. **Likes record activity** — Liking a stream records a `LIKE` activity in the stream's activity feed
9. **Settings updates are real-time** — PATCH settings route broadcasts changes via `stream.settings.update` socket event
10. **End stream emits everywhere** — Whether ended via socket, REST admin force-end, or Livepeer webhook, all paths emit the `stream.end` socket event to connected viewers
11. **Admin audit trail** — All admin actions (test flag, force-end, delete, restore) are logged via `AdminActivityService`

# Gifting

## Tipping Animation System
Different tip amounts trigger different visual effects and animations on stream

❌
No Live Display
No visual effects on screen

0 $DHB
❤️
Love Heart Emoji Pop up on screen
Love heart emoji appears on stream

1,000-9,999 $DHB
🍫
Box of Chocolate Emoji Pops Up on Screen
Chocolate box emoji appears on stream

10,000-24,999 $DHB
💐
Bouquet of Flowers Emoji Pops up on screen
Flower bouquet emoji appears on stream

25,000-49,999 $DHB
👑
Crown Emoji Pops up on screen
Crown emoji appears on stream

50,000-99,999 $DHB
💍
Magic Ring Emoji Pops up on screen
Magic ring emoji appears on screen

100,000-199,999 $DHB
⚔️
Spartans army run on screen
Spartan army animation plays

200,000-299,999 $DHB
🎉
Party starts, confetti flies, disco balls spin
Full party animation with confetti and disco balls

300,000-499,999 $DHB
🟡
Screen goes gold and coins drop from sky with sirens (3 seconds)
Golden screen effect with falling coins and siren sounds

500,000-749,999 $DHB
💰
Screen goes gold and coins drop from sky with sirens (10 seconds)
Extended golden screen effect with falling coins and siren sounds

750,000-999,999 $DHB
🎊
All previous emojis together with extra confetti and party music
Ultimate celebration with all effects combined plus extra confetti and party music

1,000,000+ $DHB