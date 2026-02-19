# Livestream Frontend Integration Guide

## Overview

The livestream system uses a **single-endpoint flow** where creating a livestream and minting the NFT happen in one API call (`POST /nft/user_mint`). The stream then transitions through status changes driven by **Livepeer webhooks** — the frontend does not manually start/stop the stream via API.

---

## Stream Lifecycle

```
+-----------------------------------------------------------------+
|  1. Creator fills form (title, description, thumbnail, etc.)     |
|  2. POST /nft/user_mint  (postType=live, with stream settings)   |
|     -> Returns: mint signature + stream entity                   |
|  3. Frontend sends on-chain mint transaction                     |
|  4. Navigate to producer page with stream data                   |
|  5. Connect WHIP (WebRTC) to Livepeer ingest URL                |
|     (fetch via GET /live/:streamId/ingesturl)                    |
|  6. Livepeer sends webhook -> stream.started -> status = LIVE    |
|  7. Creator ends stream via socket or stops WHIP                 |
|  8. Livepeer sends webhook -> stream.idle -> status = PAUSED     |
|     -> 90-second grace period starts                             |
|  9a. If creator reconnects within 90s:                           |
|      -> stream.started webhook -> status = LIVE (resumed)        |
|  9b. If 90s expires without reconnection:                        |
|      -> status = ENDED (stream is over)                          |
+-----------------------------------------------------------------+
```

### Status Flow

| Status       | Meaning                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| `OFFLINE`    | Stream entity created, not yet broadcasting                                 |
| `SCHEDULED`  | Stream scheduled for a future date                                          |
| `LIVE`       | Livepeer is receiving video data from the creator                           |
| `PAUSED`     | Stream interrupted (OBS crash, network drop) — 90s grace period is active   |
| `ENDED`      | Stream has ended (terminal state)                                           |

```
                              stream.started
  OFFLINE / SCHEDULED --------------------------> LIVE
                                                   |
                                           stream.idle
                                                   |
                                                   v
                              stream.started     PAUSED
                    LIVE <------------------- (90s grace)
                                                   |
                                           grace expires
                                                   |
                                                   v
                                                 ENDED
```

> **Important:** The transitions between statuses are driven by **Livepeer webhooks** and **server-side timers**, NOT by frontend API calls. The frontend should listen for socket events to react to these transitions.

---

### PAUSED State & Grace Period

When a streamer's connection drops (OBS crashes, network hiccup, phone locks, etc.), Livepeer sends a `stream.idle` webhook. Instead of immediately ending the stream, the backend:

1. Sets status to **`PAUSED`** and records a `pausedAt` timestamp
2. Broadcasts a **`stream.paused`** socket event to all viewers
3. Starts a **90-second grace timer** (via Bull queue — survives server restarts)
4. If the streamer reconnects within 90s: Livepeer sends `stream.started` -> backend cancels the timer, sets status back to **`LIVE`**, broadcasts **`stream.resumed`**
5. If 90s expires: backend sets status to **`ENDED`**, broadcasts **`stream.end`**, cleans up Livepeer resource

**Key properties returned during PAUSED:**

| Field                | Type   | Description                                     |
| -------------------- | ------ | ----------------------------------------------- |
| `status`             | string | `"PAUSED"`                                       |
| `pausedAt`           | string | ISO timestamp of when the pause started          |
| `gracePeriodSeconds` | number | Seconds remaining (sent in `stream.paused` event) — currently **90** |

---

## API Reference

### 1. Create Livestream (Combined Mint + Create)

**`POST /nft/user_mint`** — multipart/form-data

This is the same endpoint used for all content types. When `postType=live`, it additionally creates the Livepeer stream entity.

#### Request Body (FormData)

| Field           | Type     | Required | Description                                       |
| --------------- | -------- | -------- | ------------------------------------------------- |
| `postType`      | string   | Yes      | Must be `"live"`                                   |
| `title`         | string   | Yes      | Stream title                                       |
| `description`   | string   | No       | Stream description                                 |
| `thumbnail`     | File     | No       | Thumbnail image file                               |
| `categories`    | string   | No       | JSON array of category names, e.g. `'["Gaming"]'`  |
| `settings`      | string   | No       | JSON object: `'{"enableChat":true,"minTip":1000}'` |
| `scheduledFor`  | string   | No       | ISO date string for scheduled streams              |
| `streamDelay`   | number   | No       | Stream delay in seconds (default: 0)               |
| `streamInfo`    | string   | No       | JSON object with additional stream metadata        |
| `tokenId`       | number   | Yes      | The on-chain token ID (from mint parameters)       |
| `chain`         | string   | Yes      | Target blockchain (e.g., `"base"`)                 |
| `price`         | string   | No       | Price for PPV (if applicable)                      |

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
    "status": "OFFLINE"
  }
}
```

> **Note:** The stream response does NOT include `ingestUrl`. The ingest URL must be fetched separately via `GET /live/:streamId/ingesturl` after creation.

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

// 4. Fetch the ingest URL (separate call — not included in stream response)
const { ingestUrl } = await api.get(`/live/${stream._id}/ingesturl`);

// 5. Navigate to producer page
navigate(`/live/producer/${stream._id}`, {
  state: {
    streamKey: stream.streamKey,
    playbackId: stream.playbackId,
    ingestUrl,
  },
});
```

---

### 2. Get Stream Details

**`GET /live/:streamId`**

Returns full stream data with streamer account info, recent activities, and viewer-specific computed fields (when authenticated).

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
  "endedAt": null,
  "pausedAt": null,
  "scheduledFor": null,
  "categories": ["Gaming"],
  "settings": { "chat": { "enabled": true }, "minTip": 1000 },
  "streamDelay": 0,
  "streamInfo": {},
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T01:00:00Z",
  "activities": [],
  "account": {
    "address": "0x...",
    "username": "streamer",
    "displayName": "Cool Streamer",
    "avatarImageUrl": "https://...",
    "followers": 1000,
    "followings": 50,
    "sentTips": 500,
    "receivedTips": 10000,
    "createdAt": "2023-06-15T00:00:00Z",
    "isPrivate": false,
    "hideFollowers": false,
    "badgeBalance": 5
  },
  "isLiked": false,
  "isOwner": false,
  "isFollowing": true
}
```

**Computed fields** (only when request includes a valid auth token):

| Field          | Type    | Description                                      |
| -------------- | ------- | ------------------------------------------------ |
| `isLiked`      | boolean | Whether the viewer has liked this stream          |
| `isOwner`      | boolean | Whether the viewer is the stream owner            |
| `isFollowing`  | boolean | Whether the viewer follows the streamer           |

When not authenticated, these fields default to `false`.

> **Note:** `pausedAt` is `null` unless `status` is `"PAUSED"`. When the stream is paused, it contains the ISO timestamp of when the pause started. Use this to calculate remaining grace time on page load: `gracePeriodSeconds - ((Date.now() - new Date(pausedAt)) / 1000)`.

---

### 3. Get Active Streams List

**`GET /live`**

Returns all non-ended streams (LIVE, PAUSED, SCHEDULED, OFFLINE) sorted by `startedAt` descending. Always returns up to 20 results (no query parameters accepted).

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
{ "ingestUrl": "rtmp://livepeer.studio/live/stream-key-xxx" }
```

> **Note:** This returns the RTMP ingest URL. For WHIP (WebRTC) ingest, the frontend constructs the URL using the `playbackId`: `https://playback.livepeer.studio/webrtc/{playbackId}`. The WHIP URL is preferred for browser-based streaming.

---

### 7. Like / Unlike a Stream

**`POST /live/:streamId/like`** — Requires auth.

This is a **toggle** endpoint. If the user has already liked the stream, calling it again will unlike it. Works on any non-ended stream (LIVE, PAUSED, OFFLINE, or SCHEDULED).

#### Response

```json
{
  "likes": 43,
  "isLiked": true
}
```

| Field    | Type    | Description                                      |
| -------- | ------- | ------------------------------------------------ |
| `likes`  | number  | Updated total likes count                        |
| `isLiked`| boolean | `true` if the user now likes it, `false` if unliked |

---

### 8. Send a Tip/Gift

**`POST /live/:streamId/gift`** — Requires auth. Stream must be **LIVE** or **PAUSED** (tips are accepted during the grace period while viewers are still connected).

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

Returns all activities (chat messages, tips, joins, likes, reactions, etc.) sorted chronologically (oldest first). No query parameters.

---

### 10. Update Stream Settings (Owner Only)

**`PATCH /live/:streamId/settings`** — Requires auth, must be stream owner. Works on any stream status (not restricted to LIVE).

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

Handles two events:
- `stream.started` — Transitions to LIVE (or resumes from PAUSED)
- `stream.idle` — Transitions to PAUSED (starts grace period)

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

### Events to EMIT (Client -> Server)

| Event              | Payload                                     | Auth Required | Description                    |
| ------------------ | ------------------------------------------- | ------------- | ------------------------------ |
| `stream.join.room` | `{ streamId }`                              | No            | Join the socket room (required before receiving events) |
| `stream.join`      | `{ streamId }`                              | Yes           | Register as an active viewer   |
| `stream.left`      | `{ streamId }`                              | Yes           | Leave the stream               |
| `stream.end`       | `{ streamId }`                              | Yes           | End the stream (owner only)    |
| `stream.message`   | `{ streamId, content }`                     | Yes           | Send a chat message (max 500 chars, trimmed) |
| `stream.reaction`  | `{ streamId, reactionType }`                | Yes           | Send a reaction (see types below) |
| `heartbeat`        | (none)                                      | No            | Keep connection alive          |

> **Important:** The reaction event uses `reactionType` (not `type`) in the payload.

#### Reaction Types

Valid values for `stream.reaction` -> `reactionType`:

| Type          | Usage                    |
| ------------- | ------------------------ |
| `LIKE`        | Thumbs up / like         |
| `HEART`       | Heart / love             |
| `CELEBRATE`   | Party / celebration      |
| `SUPPORT`     | Fist bump / support      |
| `LAUGH`       | Laughing / funny         |

### Events to LISTEN (Server -> Client)

| Event                      | Payload                                                                               | Description                       |
| -------------------------- | ------------------------------------------------------------------------------------- | --------------------------------- |
| `stream.start`             | `{ streamId, status, startedAt }`                                                     | Stream went LIVE (first time)     |
| `stream.paused`            | `{ streamId, status: 'PAUSED', pausedAt, gracePeriodSeconds }` | Stream interrupted — grace period started. `gracePeriodSeconds` = 90. Frontend should show reconnecting overlay with countdown. |
| `stream.resumed`           | `{ streamId, status: 'LIVE' }`                                                        | Streamer reconnected within grace period. Cancel countdown, resume playback. |
| `stream.end`               | `{ streamId }` or `{ streamId, status, endedAt, duration }`                          | Stream ended. Minimal payload from socket-initiated end; full payload from webhook/grace expiry. |
| `stream.join`              | `{ viewerCount, user: { address, username } }`                                        | A viewer joined                   |
| `stream.left`              | `{ viewerCount, user: { address, username } }`                                        | A viewer left                     |
| `stream.viewers.update`    | `{ viewerCount }`                                                                     | Viewer count changed              |
| `stream.like`              | `{ likes }`                                                                           | Someone liked (or unliked) the stream |
| `streamer.tip`             | `{ gift: { address, amount, message, ... } }`                                         | Someone tipped the streamer       |
| `stream.message`           | `{ message: { content, user, ... } }`                                                 | Chat message received             |
| `stream.reaction`          | `{ reactionType, user: { address, username } }`                                       | A viewer sent a reaction. Note: uses `reactionType` not `type`. |
| `stream.settings.update`   | `{ streamId, settings }`                                                              | Stream settings changed by owner  |
| `stream.user.banned`       | `{ streamId, address }`                                                               | A user was banned from stream (reserved) |
| `stream.user.muted`        | `{ streamId, address }`                                                               | A user was muted in stream (reserved)  |
| `stream.error`             | `{ streamId, message }`                                                               | Stream error occurred (reserved)  |
| `heartbeat`                | `{ clientId, address, serverTs }`                                                     | Heartbeat echo                    |
| `update-online-users`      | `string[]`                                                                            | Array of online user addresses    |

> **Reserved events:** `stream.user.banned`, `stream.user.muted`, and `stream.error` are defined in the events enum but not actively emitted yet. They are reserved for future use.

---

## Producer Page Flow (Streamer)

```typescript
// 1. After mint, you have stream data from the response
const { _id: streamId, streamKey, playbackId } = stream;

// 2. Fetch the ingest URL (not included in mint response)
const { ingestUrl } = await api.get(`/live/${streamId}/ingesturl`);
// ingestUrl = "rtmp://livepeer.studio/live/{streamKey}"

// For WHIP (WebRTC) ingest, construct the URL:
const whipUrl = `https://playback.livepeer.studio/webrtc/${playbackId}`;

// 3. Connect socket and join room
socket.emit('stream.join.room', { streamId });

// 4. Connect WHIP (WebRTC) to Livepeer for browser-based streaming
const pc = new RTCPeerConnection();
// ... add tracks, create offer, POST to whipUrl ...

// 5. Listen for stream.start event (Livepeer webhook fires when video arrives)
socket.on('stream.start', (data) => {
  // Stream is now LIVE
  setStreamStatus('LIVE');
});

// 5b. Listen for reactions
socket.on('stream.reaction', (data) => {
  // data = { reactionType, user: { address, username } }
  // Show reaction animation overlay
  showReactionAnimation(data.reactionType, data.user);
});

// 5c. Handle pause/resume (OBS crash, network drop, etc.)
socket.on('stream.paused', (data) => {
  // data = { streamId, status: 'PAUSED', pausedAt, gracePeriodSeconds: 90 }
  setStreamStatus('PAUSED');
  // Show "Reconnecting..." UI with countdown timer
  startCountdown(data.gracePeriodSeconds);
});

socket.on('stream.resumed', (data) => {
  // data = { streamId, status: 'LIVE' }
  setStreamStatus('LIVE');
  cancelCountdown();
});

// 6. Update settings while live (e.g. toggle chat)
await api.patch(`/live/${streamId}/settings`, {
  settings: { chat: { enabled: false } },
});
// All viewers will receive stream.settings.update automatically

// 7. To end the stream
socket.emit('stream.end', { streamId });
// OR just stop the WHIP connection — Livepeer will fire stream.idle webhook
// NOTE: stream.idle now triggers PAUSED (not ENDED). The stream will end
// after the 90s grace period if the streamer doesn't reconnect.

// 8. Listen for stream.end confirmation
socket.on('stream.end', (data) => {
  setStreamStatus('ENDED');
  // data may be just { streamId } (socket end) or { streamId, status, endedAt, duration } (grace/webhook end)
});
```

---

## Viewer Page Flow

```typescript
// 1. Fetch stream details
const stream = await api.get(`/live/${streamId}`);
// stream includes: isLiked, isOwner, isFollowing (if authenticated)

// 2. Connect socket and join room (no auth needed to watch)
socket.emit('stream.join.room', { streamId });
socket.emit('stream.join', { streamId }); // requires auth — registers as active viewer

// 3. Play HLS video
// Playback URL: https://livepeercdn.studio/hls/{playbackId}/index.m3u8
const hlsUrl = `https://livepeercdn.studio/hls/${stream.playbackId}/index.m3u8`;

// 4. Listen for real-time events
socket.on('stream.message', (data) => { /* add to chat */ });
socket.on('stream.like', (data) => { /* update like count: data.likes */ });
socket.on('streamer.tip', (data) => { /* show tip animation: data.gift */ });
socket.on('stream.viewers.update', (data) => { /* update viewer count: data.viewerCount */ });
socket.on('stream.end', (data) => { /* show ended state */ });
socket.on('stream.reaction', (data) => {
  // data = { reactionType, user: { address, username } }
  // Show floating reaction animation
  showReactionAnimation(data.reactionType, data.user);
});
socket.on('stream.settings.update', (data) => {
  // data = { streamId, settings }
  // Update UI — e.g. toggle chat visibility, update min tip
});

// 4b. Handle stream pause/resume (streamer's connection dropped)
socket.on('stream.paused', (data) => {
  // data = { streamId, status: 'PAUSED', pausedAt, gracePeriodSeconds: 90 }
  setStreamStatus('PAUSED');
  // Show a non-dismissible overlay: "Stream paused — reconnecting..."
  // Start a visible countdown timer (90 seconds)
  // Keep the video player mounted — video will freeze at the last frame
  // Chat remains open and functional during PAUSED
  startReconnectingOverlay(data.gracePeriodSeconds);
});

socket.on('stream.resumed', (data) => {
  // data = { streamId, status: 'LIVE' }
  setStreamStatus('LIVE');
  // Remove the overlay, cancel countdown
  // HLS playback will auto-resume as Livepeer starts sending segments again
  hideReconnectingOverlay();
});

// 5. Send chat messages (max 500 chars — works during LIVE and PAUSED)
socket.emit('stream.message', { streamId, content: 'Hello!' });

// 6. Send a reaction (uses reactionType, not type)
socket.emit('stream.reaction', { streamId, reactionType: 'HEART' });

// 7. Like/unlike the stream (via REST, not socket — toggles)
const { likes, isLiked } = await api.post(`/live/${streamId}/like`);

// 8. On leave
socket.emit('stream.left', { streamId });
```

---

## Scheduled Streams

If `scheduledFor` is set to a future date during creation, the stream starts with status `SCHEDULED`.

- The stream will remain `SCHEDULED` until the creator starts broadcasting via WHIP
- When Livepeer receives video data, the webhook fires `stream.started` -> status becomes `LIVE`
- Frontend should show a countdown or "Starts at X" for scheduled streams

---

## Test Streams

Test streams (flagged with `isTest: true`) behave differently:
- When they go idle, status resets to `OFFLINE` instead of entering PAUSED/ENDED
- The Livepeer stream resource is NOT deleted
- This allows the creator to go live again with the same stream entity

---

## Error Handling

| HTTP Code | Scenario                                    |
| --------- | ------------------------------------------- |
| 400       | Missing tokenId, stream not live (for tips), chat message too long |
| 401       | Invalid Livepeer webhook signature          |
| 403       | Not authorized (wrong owner for key/ingest) |
| 404       | Stream not found                            |

---

## Admin Livestream Endpoints

All admin endpoints require `AdminJwtAuthGuard` authentication. Role restrictions are noted per endpoint.

### List Streams

**`GET /admin/livestreams`**

Query parameters:

| Param      | Type   | Description                                    |
| ---------- | ------ | ---------------------------------------------- |
| `page`     | number | Page number (default: 1)                       |
| `limit`    | number | Items per page (default: 20, max: 100)         |
| `status`   | string | Filter by status: `OFFLINE`, `LIVE`, `PAUSED`, `ENDED`, `SCHEDULED`, or `all` |
| `address`  | string | Filter by streamer address (case-insensitive)  |
| `search`   | string | Search in title and description                |
| `isTest`   | string | `"true"` or `"false"` to filter test streams   |

Returns:

```json
{
  "items": [],
  "totalCount": 142,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

Accessible by all admin roles (SUPER_ADMIN, ADMIN, MODERATOR, VIEWER).

### Get Stream Detail

**`GET /admin/livestreams/:id`**

The `id` parameter can be either the MongoDB ObjectId or the on-chain tokenId.

Returns full stream data plus admin-only fields: `isTest`, `isDeleted`, `streamKey`, `livepeerId`, `settings`.

Accessible by all admin roles.

### Toggle Test Flag

**`PATCH /admin/livestreams/:id/test`** — Roles: `SUPER_ADMIN`, `ADMIN`

```json
{ "isTest": true }
```

When enabling `isTest` on an `ENDED` stream, the status is automatically reset to `OFFLINE` so it can be reused.

### Force End Stream

**`POST /admin/livestreams/:id/end`** — Roles: `SUPER_ADMIN`, `ADMIN`

Force-ends a stream regardless of ownership. Terminates the Livepeer session and broadcasts `stream.end` to all connected viewers. Cannot be used on already-ended streams. Test streams are reset to `OFFLINE` instead.

### Soft Delete Stream

**`DELETE /admin/livestreams/:id`** — Roles: `SUPER_ADMIN`, `ADMIN`

Marks the stream as deleted (`isDeleted: true`) and sets status to `ENDED`. If the stream was `LIVE`, `PAUSED`, or `OFFLINE`, it is ended first. If the stream was `PAUSED`, the pending grace timer is also cancelled. Also permanently deletes the Livepeer stream resource.

### Restore Stream

**`PATCH /admin/livestreams/:id/restore`** — Roles: `SUPER_ADMIN`, `ADMIN`

Restores a soft-deleted stream (`isDeleted: false`).

> **Note:** The Livepeer stream resource was permanently deleted during soft-delete, so the restored stream will need a new Livepeer session to go live again.

---

## Key Architecture Notes

1. **No separate createStream endpoint** — Stream creation is handled inside `POST /nft/user_mint` when `postType=live`.
2. **Livepeer drives status changes** — The backend receives webhooks from Livepeer (`stream.started`, `stream.idle`) and updates status accordingly. Webhooks are verified with HMAC SHA256 if `LIVEPEER_WEBHOOK_SECRET` is set.
3. **Grace period on disconnect** — When `stream.idle` fires, the stream enters `PAUSED` state with a **90-second** grace period (via Bull delayed job — survives server restarts). If `stream.started` fires within 90s, the stream resumes to `LIVE`. If not, it transitions to `ENDED`. This prevents streams from ending due to brief network hiccups.
4. **Socket events are broadcast** — All real-time updates go through socket.io rooms (`stream:{streamId}`).
5. **Anonymous viewers supported** — `stream.join.room` does not require authentication, so anyone can watch. Sending messages, reactions, and registering as a viewer require auth.
6. **Chat works during PAUSED** — Chat messages and reactions are accepted when the stream is `LIVE` or `PAUSED`. Viewers remain connected during the grace period and can continue chatting.
7. **Chat messages validated** — Messages are trimmed and capped at 500 characters. Empty messages are rejected.
8. **User data uses `userReferenceProjection`** — All user lookups return consistent fields: `address, username, displayName, avatarImageUrl, followers, followings, sentTips, receivedTips, createdAt, isPrivate, hideFollowers, badgeBalance`.
9. **Redis tracks viewer counts** — `stream:{streamId}:viewers` key in Redis for fast viewer count reads. Counts are clamped to 0 minimum.
10. **Likes are toggleable** — `POST /live/:streamId/like` toggles like/unlike and returns the new state. A `stream.like` event with the updated count is broadcast.
11. **Settings updates are real-time** — PATCH settings route broadcasts changes via `stream.settings.update` socket event. Settings can be updated regardless of stream status.
12. **End stream emits everywhere** — Whether ended via socket, REST admin force-end, or Livepeer webhook grace expiry, all paths emit the `stream.end` socket event to connected viewers.
13. **Admin audit trail** — All admin actions (test flag, force-end, delete, restore) are logged via `AdminActivityService`.
14. **Ingest URL is RTMP** — The `GET /live/:streamId/ingesturl` endpoint returns an RTMP URL. For WHIP (WebRTC) streaming from the browser, construct: `https://playback.livepeer.studio/webrtc/{playbackId}`.
