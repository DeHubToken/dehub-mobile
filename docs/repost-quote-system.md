# Repost & Quote Post System

## Overview

DeHub supports two types of content sharing:

1. **Repost** — Lightweight reshare (like a retweet). Not a new token; surfaces the original post on the reposter's timeline.
2. **Quote Post** — Full minted token that references another post. The quote post is its own NFT with independent engagement (likes, comments, tips, etc.).

Both systems follow platform patterns: privacy filtering, block filtering, activity logging, and push notifications.

---

## Repost System

### How it Works
- A repost is a **toggle** — repost once, toggle again to un-repost.
- One user can repost a given post only once.
- Cannot repost your own content.
- Reposts appear on the user's profile timeline (similar to retweets on Twitter/X).
- The original post's `reposts` count is incremented/decremented.
- The original creator receives a notification.

### Privacy Rules
- **Public accounts**: Anyone can see their reposts.
- **Private accounts**: Only accepted followers can view their reposts.
- **Block filtering**: Reposts from/of blocked users are filtered out.

### API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/repost` | Required | Toggle repost on a post |
| GET | `/reposts?address=0x...` | Optional | Get user's reposts (paginated, with full token data) |
| GET | `/repost/count?tokenId=123` | None | Get repost count for a token |
| GET | `/repost/users?tokenId=123` | None | Get list of users who reposted |

#### POST `/repost` — Toggle Repost

**Request:**
```json
{
  "tokenId": 123
}
```

**Response (reposted):**
```json
{
  "status": true,
  "reposted": true,
  "repostCount": 5,
  "message": "Post reposted"
}
```

**Response (un-reposted):**
```json
{
  "status": true,
  "reposted": false,
  "repostCount": 4,
  "message": "Repost removed"
}
```

#### GET `/reposts?address=0x...`

Returns the user's reposts with full original post data. Each item includes:
- `isRepost: true` — marks this as a repost
- `repostedAt` — when the repost was created
- `repostedBy` — address of the reposter
- All standard post fields from the original token

---

## Quote Post System

### How it Works
- A quote post is a **new minted token** that references another post.
- Uses the same `user_mint` minting flow (signature + on-chain mint).
- The quote post has its own `tokenId`, engagement counters, and tokenomics.
- The original post's `quotes` count is incremented.
- The original creator receives a notification.

### Rules
- **Can quote any post type**: video, image, text, livestream.
- **Cannot quote WITH a livestream** — only text, image, or video for the quoting post.
- **No monetisation** — quote posts cannot have PPV, lock content, bounty, or subscription gating. Monetisation fields are automatically stripped.
- The quoted post embed is resolved at read-time (not denormalized).
- If the quoted post is deleted/hidden, the embed shows `{ unavailable: true, reason: 'deleted' }`.

### Minting Flow (same 2-step as `user_mint`)

1. **Call `POST /quote_post`** — upload content + `quotedTokenId`. Backend creates the token, returns mint signature.
2. **Call the smart contract** — use the returned `createdTokenId`, `r`, `s`, `v`, `timestamp` to call `mint()` on-chain.

### API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/quote_post` | Required | Create a quote post (minted token) |
| GET | `/quotes?tokenId=123` | Optional | Get quote posts for a token |

#### POST `/quote_post` — Create Quote Post

**Request** (multipart/form-data):
```
quotedTokenId: 456           // Required: the post being quoted
postType: feed-simple        // feed-simple | feed-images | video (NOT live)
description: "This is fire"  // Text content
name: ""                     // Optional title
streamInfo: "{}"             // Monetization settings (JSON string)
chainId: 8453                // Optional (defaults to config)
category: "[]"               // Optional categories (JSON string)
plans: null                  // Optional subscription plan IDs
file: [binary]               // Required for video/image posts
```

**Response:**
```json
{
  "r": "0x...",
  "s": "0x...",
  "v": 27,
  "createdTokenId": "789",
  "timestamp": 1737158400,
  "quotedTokenId": 456,
  "isQuotePost": true
}
```

#### GET `/quotes?tokenId=123`

Returns paginated quote posts for a given token. Each quote post is a full token item with standard feed data.

---

## Feed Integration

### New Fields on Every Post

Every post returned from **any** feed-related endpoint now includes repost/quote fields.
This applies to: `GET /feed`, `GET /nft_info/:id`, `GET /myPosts`, `GET /savedPosts`,
`GET /liked_videos`, `GET /my_watched_nfts`, `GET /search_nfts`, and `GET /reposts`.

| Field | Type | Description |
|-------|------|-------------|
| `reposts` | number | Total repost count |
| `quotes` | number | Total quote post count |
| `isReposted` | boolean | Whether the authenticated viewer has reposted this (only when JWT is provided) |
| `isQuotePost` | boolean | Whether this post is a quote post |
| `quotedTokenId` | number \| null | TokenId of the quoted post (only on quote posts) |
| `quotedPost` | object \| null | Embedded quoted post data (only on quote posts) |

### Affected Endpoints — Summary

| Endpoint | Repost Fields | Notes |
|----------|---------------|-------|
| `GET /feed` | `reposts`, `quotes`, `isReposted`, `isQuotePost`, `quotedTokenId`, `quotedPost` | Main feed (chronological & shuffle) |
| `GET /nft_info/:id` | `reposts`, `quotes`, `isReposted`, `isQuotePost`, `quotedTokenId`, `quotedPost` | Single post detail |
| `GET /myPosts` | `reposts`, `quotes`, `isReposted`, `isQuotePost`, `quotedTokenId`, `quotedPost` | Own posts (includes hidden & pending) |
| `GET /savedPosts` | `reposts`, `quotes`, `isReposted`, `isQuotePost`, `quotedTokenId`, `quotedPost` | Saved posts collection |
| `GET /liked_videos` | `reposts`, `quotes`, `isReposted`, `isQuotePost`, `quotedTokenId`, `quotedPost` | Liked posts |
| `GET /my_watched_nfts` | `reposts`, `quotes`, `isReposted`, `isQuotePost`, `quotedTokenId`, `quotedPost` | Watch history |
| `GET /reposts` | `reposts`, `quotes`, `isReposted`, `isQuotePost`, `quotedTokenId`, `quotedPost` | User's reposts timeline |
| `GET /quotes` | `reposts`, `quotes`, `isReposted`, `isQuotePost`, `quotedTokenId`, `quotedPost` | Quote posts for a token |

### Complete Post Object (All User-Context Fields)

When authenticated (JWT Bearer), every post object includes the full set of user-context flags:

```json
{
  "tokenId": 123,
  "name": "My Post",
  "description": "Post description...",
  "imageUrl": "images/123.png",
  "videoUrl": "videos/123",
  "minter": "0xabc...",
  "postType": "video",
  "views": 5000,
  "likes": 200,
  "commentCount": 50,

  "isLiked": false,
  "isDisliked": false,
  "isSaved": true,
  "isFollowing": true,
  "isOwner": false,
  "isHidden": false,
  "isUnlocked": true,

  "reposts": 10,
  "quotes": 3,
  "isReposted": false,
  "isQuotePost": false,
  "quotedTokenId": null,
  "quotedPost": null,

  "createdAt": "2026-01-15T10:30:00Z"
}
```

For a **quote post** (`isQuotePost: true`), the same object would have:

```json
{
  "tokenId": 789,
  "name": "My take on this...",
  "isQuotePost": true,
  "quotedTokenId": 456,
  "reposts": 2,
  "quotes": 0,
  "isReposted": false,
  "quotedPost": { "...see below..." }
}
```

### Quoted Post Embed

When a post is a quote post (`isQuotePost: true`), the `quotedPost` field contains:

```json
{
  "tokenId": 456,
  "name": "Original Post Title",
  "description": "First 280 chars of original post...",
  "imageUrl": "images/456.png",
  "imageUrls": [],
  "videoUrl": "videos/456",
  "postType": "video",
  "minter": "0x...",
  "minterUser": {
    "address": "0x...",
    "username": "creator",
    "displayName": "The Creator",
    "avatarImageUrl": "avatars/123.jpg",
    "followers": 1500,
    "badgeBalance": 10000
  },
  "status": "minted",
  "views": 5000,
  "likes": 200,
  "totalVotes": { "for": 200, "against": 5 },
  "comments": 50,
  "reposts": 10,
  "quotes": 3,
  "createdAt": "2026-01-15T10:30:00Z",
  "category": ["Entertainment"],
  "videoDuration": 120
}
```

If the quoted post is unavailable:
```json
{
  "tokenId": 456,
  "unavailable": true,
  "reason": "deleted"  // "deleted" | "hidden" | "not_found"
}
```

---

## Data Model

### Repost Collection (`reposts`)

| Field | Type | Description |
|-------|------|-------------|
| `tokenId` | Number | Token being reposted |
| `address` | String | Reposter's address (lowercase) |
| `user` | ObjectId → accounts | Reposter user reference |
| `token` | ObjectId → tokens | Token reference |
| `originalMinter` | String | Original post creator (for privacy filtering) |
| `originalMinterUser` | ObjectId → accounts | Original minter reference |

**Indexes:**
- `{ address, tokenId }` — unique compound (one repost per user per token)
- `{ address, createdAt: -1 }` — user timeline
- `{ tokenId, createdAt: -1 }` — who reposted

### Token Schema Updates

New fields added to the Token model:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `reposts` | Number | 0 | Total repost count |
| `quotes` | Number | 0 | Total quote post count |
| `isQuotePost` | Boolean | false | Is this a quote post? |
| `quotedTokenId` | Number | null | Token being quoted |
| `quotedToken` | ObjectId → tokens | null | Quoted token reference |

---

## Activity Tracking

New activity types:
- `repost` — User reposted a post
- `unrepost` — User removed a repost
- `quote-post` — User created a quote post

---

## Notifications

New notification types:
- `repost` — "Username reposted your video/post"
- `quote` — "Username quoted your video/post"

Both map to the **engagement** category and use the `likes` preference for toggling.

---

## Frontend Integration Guide

### Displaying Reposts on User Profile

1. Call `GET /reposts?address={userAddress}&page=1&limit=20`
2. Each item has `isRepost: true` — render with a "X reposted" header
3. Merge with the user's own posts for a complete timeline (sort by `createdAt`/`repostedAt`)

### Repost Button

1. Check `isReposted` on the post data
2. On tap: `POST /repost` with `{ tokenId }`
3. Toggle UI based on response `reposted` field
4. Update local `repostCount` from response

### Quote Post Button

1. Open compose screen with quoted post reference
2. User writes text/uploads media (same as regular post creation)
3. Call `POST /quote_post` with all fields + `quotedTokenId`
4. Complete on-chain mint with returned signature (same flow as `user_mint`)

### Rendering Quote Posts in Feed

1. Check `isQuotePost` on post data
2. If true, render the quoted post embed from `quotedPost` field
3. If `quotedPost.unavailable === true`, show "This post is no longer available"
4. The quote post itself is interacted with normally (like, comment, tip, etc.)

### Engagement Stats Display

Show repost + quote counts alongside likes/comments:
```
❤️ 200  💬 50  🔁 15  ✍️ 3
              ↑reposts  ↑quotes
```
