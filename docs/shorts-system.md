# Shorts — Frontend Integration Guide

> Documentation for the short-form vertical video system (postType: `short`).

---

## Overview

Shorts are vertical (9:16) short-form videos optimized for mobile scroll/swipe views, similar to TikTok/Reels. They share the same `POST /nft/user_mint` endpoint as regular videos but have distinct processing, validation, and auto-generated assets.

---

## Uploading a Short

### Endpoint

`POST /nft/user_mint` (multipart/form-data)

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `postType` | string | Yes | Must be `"short"` |
| `name` | string | Yes | Title of the short |
| `description` | string | No | Description text |
| `streamInfo` | string | No | JSON string with monetization settings (defaults to `{}`) |
| `chainId` | number | No | Blockchain chain ID (defaults to BSC mainnet) |
| `category` | string | No | JSON array of category names (e.g. `'["Entertainment"]'`) |
| `plans` | string | No | JSON string of subscription plan IDs for gated content |
| `files[0]` | File | **Yes** | Video file (MP4) |
| `files[1]` | File | No | Thumbnail image (JPG/PNG). Auto-generated if omitted. |

### Example Request

```typescript
const formData = new FormData();
formData.append('postType', 'short');
formData.append('name', 'My First Short');
formData.append('description', 'Check this out!');
formData.append('streamInfo', JSON.stringify({ isLockContent: false }));
formData.append('chainId', '8453');
formData.append('category', JSON.stringify(['Entertainment']));
formData.append('files', videoFile);
// Optional: formData.append('files', thumbnailFile);

const response = await api.post('/nft/user_mint', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
```

### Response (200)

```json
{
  "r": "0x...",
  "s": "0x...",
  "v": 27,
  "createdTokenId": "123",
  "timestamp": 1737158400
}
```

Use these values for the on-chain `mint()` call (same 2-step minting flow as regular videos).

---

## Shorts vs Regular Video

| Aspect | Short (`postType: 'short'`) | Video (`postType: 'video'`) |
|--------|------|-------|
| **Thumbnail** | Optional — auto-extracted at 1s if omitted | Required (must provide `files[1]`) |
| **Max duration** | 90 seconds (hard enforced) | No limit |
| **Encoding quality** | CRF 25 (smaller files) | CRF 23 (higher quality) |
| **Max resolution** | 1080×1920 (9:16 portrait) | 1920×1080 (16:9 landscape) |
| **Preview clip** | Auto-generated (~3s silent MP4) | None |
| **Minimum files** | 1 (video only) | 2 (video + thumbnail) |
| **Preset** | fast | fast |

---

## Auto-Generated Assets

When a short is uploaded, the backend automatically generates these assets during transcoding:

### 1. Thumbnail (if not provided by client)

- **Extracted at**: 1 second into the video (0s if video is shorter than 1s)
- **Format**: High-quality JPEG (`-q:v 2`)
- **Stored at**: `shorts/{tokenId}.jpg`
- **Response field**: `imageUrl`

### 2. Preview Clip (always generated)

- **Duration**: ~3 seconds
- **Start point**: 1 second into the video (0s if video is shorter)
- **Resolution**: Max 360×640 (low-res for fast loading)
- **Compression**: CRF 32, preset ultrafast (~50–150 KB)
- **Audio**: Silent (no audio track)
- **Stored at**: `previews/{tokenId}.mp4`
- **Response field**: `previewUrl`
- **Purpose**: Grid/feed thumbnail display for TikTok-style infinite scroll views

---

## Transcoding Specifications

| Specification | Value |
|---------------|-------|
| Codec | H.264 (libx264) |
| CRF | 25 |
| Preset | fast |
| Max resolution | 1080×1920 (never upscales) |
| Aspect ratio | Preserved, fit within 1080×1920 |
| Audio codec | AAC |
| Audio bitrate | 128 kbps |
| Container | MP4 |
| Fast start | `movflags +faststart` (instant playback during scroll) |
| Pixel format | yuv420p |
| Max duration | 90 seconds (`-t 90` hard cap) |

---

## Token Document Fields (GET endpoints)

When fetching shorts via any GET endpoint, these fields are relevant:

```typescript
{
  tokenId: number;                  // Unique token ID
  postType: 'short';               // Always 'short'
  name: string;                    // Title
  description: string;             // Description
  imageUrl: string | null;         // Thumbnail path (e.g. "shorts/123.jpg")
  previewUrl: string | null;       // 3s silent preview clip (e.g. "previews/123.mp4")
  videoUrl: string;                // Full video path (e.g. "videos/123.mp4")
  videoDuration: number;           // Duration in seconds (≤ 90)
  transcodingStatus: 'on' | 'done' | 'failed';  // Processing status
  progress: number;                // 0–100 transcoding progress
  status: 'signed' | 'pending' | 'minted' | 'failed';
  minter: string;                  // Creator wallet address
  views: number;                   // View count
  totalVotes: { for: number; against: number };
  commentCount: number;
  category: string[];
  chainId: number;
  createdAt: string;
}
```

---

## WebSocket Progress Events

During transcoding and upload, real-time progress is emitted via WebSocket.

### Subscribing to Progress

```typescript
// Connect to the job gateway WebSocket
const socket = io('/jobs');  // or your configured namespace

// Listen for progress on a specific token
socket.on('{tokenId}', (data) => {
  console.log(`${data.progress}% — ${data.stage}`);
});
```

### Event Data

```typescript
{
  progress: number;                   // 0–100
  stage: 'transcoding' | 'uploading'; // Current phase
}
```

### Flow

1. **Transcoding phase**: `{ progress: 0–100, stage: 'transcoding' }` — ffmpeg encoding progress
2. **Upload phase**: `{ progress: 0–100, stage: 'uploading' }` — S3 upload progress

When transcoding completes, the token's `transcodingStatus` changes from `'on'` to `'done'` (or `'failed'`).

---

## Frontend Display Recommendations

### Feed/Grid View
- Use `previewUrl` for auto-playing silent preview clips in grid/scroll views
- Use `imageUrl` as the poster/fallback before the preview loads
- Show duration badge overlay (from `videoDuration`)

### Full Player View
- Use `videoUrl` for the full video playback
- Use `imageUrl` as poster frame
- Show `transcodingStatus` indicator if still processing (`'on'`)

### Upload Flow
1. Submit the multipart form to `/nft/user_mint`
2. Receive the signature payload → call the on-chain `mint()` function
3. Subscribe to WebSocket progress events using the `createdTokenId`
4. Show transcoding progress bar to the user
5. Once `transcodingStatus` becomes `'done'`, the short is ready

---

## Validation & Error Responses

| Scenario | Status | Message |
|----------|--------|---------|
| Missing video file | 400 | `"Short posts require at least a video file (thumbnail is optional)"` |
| Video exceeds 90s after transcode | Failed | `transcodingStatus` set to `'failed'` |
| Unsupported format | 400 | `"Video posts require MP4 format"` |
| Feature disabled | 503 | `"Video uploads are temporarily disabled"` |
| Not authenticated | 401 | `"Unauthorized"` |
| No posting permissions | 403 | `"User does not have posting permissions"` |
