# Block System — Developer Reference

## Overview

The block system lets authenticated users block any other account on the platform.
The implementation is **bidirectional** — any active block between two accounts (in either direction) restricts interaction symmetrically, similar to Twitter / X.

---

## Table of Contents

1. [Endpoints](#endpoints)
2. [Block semantics (what blocking does)](#block-semantics)
3. [Profile — block status on `GET /account_info/:id`](#profile-block-status)
4. [Feed filtering](#feed-filtering)
5. [Messaging restrictions](#messaging-restrictions)
6. [Data model](#data-model)
7. [Shared utilities](#shared-utilities)
8. [Edge cases & design decisions](#edge-cases--design-decisions)

---

## Endpoints

All block endpoints require a valid JWT Bearer token (`Authorization: Bearer <token>`).

### `POST /block` — Block a user

Block another account by wallet address. Idempotent.

**Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | `string` | ✅ | Wallet address (0x…) of the user to block |
| `reason` | `string` | ❌ | Private reason (max 500 chars, **never** shown to the blocked user) |

**Response `200`**

```json
{
  "status": true,
  "message": "User blocked successfully",
  "blockId": "665f1a2b3c4d5e6f7a8b9c0d",
  "blocked": {
    "address": "0xabc...",
    "username": "SilentBadger#F7DA",
    "displayName": "Silent Badger"
  }
}
```

**Errors**

| Code | Reason |
|------|--------|
| `400` | Invalid address format, or attempt to block yourself |
| `401` | Missing / invalid JWT |
| `404` | Target account does not exist |

---

### `DELETE /block/:address` — Unblock a user

Removes an existing block. All restrictions are lifted immediately.

**Params**: `address` — wallet address to unblock.

**Response `200`**

```json
{ "status": true, "message": "User unblocked successfully", "address": "0xabc..." }
```

**Errors**

| Code | Reason |
|------|--------|
| `404` | No active block found for this address |

---

### `GET /block` — Your block list

Paginated list of users **you have blocked**.

**Query params**: `page` (default 1), `limit` (default 20, max 50).

**Response `200`**

```json
{
  "status": true,
  "total": 3,
  "page": 1,
  "limit": 20,
  "pages": 1,
  "items": [
    {
      "blockId": "...",
      "address": "0xabc...",
      "username": "NeonFalcon#1A2B",
      "displayName": "Neon Falcon",
      "avatarImageUrl": "https://...",
      "reason": "Spam",
      "blockedAt": "2026-02-18T12:00:00.000Z"
    }
  ]
}
```

---

### `GET /block/blocked-by` — Accounts that blocked you

Paginated list of users **who have blocked you**. The blocker's private reason is never exposed.

**Query params**: `page`, `limit`.

---

### `GET /block/status/:address` — Check block status

Returns the bidirectional block state between the authenticated user and any address.

**Response `200`**

```json
{
  "status": true,
  "youBlocked": false,
  "blockedYou": true,
  "isBlocked": true
}
```

| Field | Meaning |
|-------|---------|
| `youBlocked` | You have blocked this user |
| `blockedYou` | This user has blocked you |
| `isBlocked` | Any block exists in either direction |

---

## Block semantics

| Feature | Effect |
|---------|--------|
| **Feed** | Posts from blocked users are excluded in both directions (neither party sees the other's posts in any feed, including the random shuffle feed). |
| **DMs — new conversations** | Blocked users do not appear in the DM user search (`GET /dm/search`). |
| **DMs — sending messages** | If a block exists between sender and recipient in a 1-to-1 DM, the send is rejected with `403`. |
| **Profile visibility** | Profiles remain publicly viewable. `youBlocked`, `blockedYou`, and `isBlocked` flags are included on `GET /account_info/:id` when authenticated. |
| **Follow relationships** | Existing follows are **preserved** — blocking does not auto-unfollow. The user can manually unfollow if desired. |
| **Comments** | Comments on content are not filtered by this system (that is handled by the feed-report / moderation system). |

> **Note**: Group DMs are not affected by the platform block — that is handled by the existing `blockGroupUser` / `blockDm` conversation-scoped system.

---

## Profile block status

When an authenticated user calls `GET /account_info/:id` for *another* user's profile, three extra fields are returned:

```json
{
  "result": {
    "address": "0xabc...",
    "username": "...",
    "youBlocked": false,
    "blockedYou": true,
    "isBlocked": true,
    ...
  }
}
```

These fields are **absent** when viewing your own profile (they are meaningless in that context).

Recommended frontend usage:

```
if (isBlocked) → show "Unblock" or "Blocked you" banner; disable Follow / Tip / DM buttons
if (youBlocked) → show "Unblock" CTA
if (blockedYou) → show "This user has restricted interactions" message
```

---

## Feed filtering

The block filter is applied as the **first `$match` stage** in the MongoDB aggregation pipeline for both `getFeed` (regular) and `getRandomFeed` (shuffle). The filter uses a bidirectional address set resolved before the pipeline runs.

```
blockedAddresses = { addresses you blocked } ∪ { addresses that blocked you }

$match: { minter: { $nin: blockedAddresses } }
```

The set is resolved with two parallel indexed queries on the `blocks` collection (no joins inside the aggregation) — O(1) latency regardless of feed size.

---

## Messaging restrictions

### DM user search (`GET /dm/search`)

After the MongoDB aggregation, results are filtered in-app to remove any user with an active block relationship with the caller. Blocked users simply do not appear in search results.

### Sending media messages (`POST /dm/upload`)

Before creating a message, the service checks whether a block exists between the sender and the other participant of a 1-to-1 DM. If a block is found, the request is rejected with:

```json
{ "error": "You cannot send messages to this user due to a block." }
```

Status code: `403 Forbidden`.

---

## Data model

**Collection**: `blocks`

```
blocker          ObjectId  → accounts._id   (indexed)
blockerAddress   String    lowercase        (indexed, unique together with blockedAddress)
blocked          ObjectId  → accounts._id   (indexed)
blockedAddress   String    lowercase
reason           String?   max 500 chars (private, never exposed to blocked user)
createdAt        Date
updatedAt        Date
```

**Indexes**

| Index | Purpose |
|-------|---------|
| `{ blocker: 1, blocked: 1 }` unique | Prevent duplicate block records |
| `{ blockerAddress: 1, blockedAddress: 1 }` unique | Fast "is X blocked by Y?" by address |
| `{ blockedAddress: 1 }` | Fast "who has blocked me?" |
| `{ blocker: 1 }` | Fast "who have I blocked?" (list endpoint) |

---

## Shared utilities

**`common/util/block.ts`**

| Export | Description |
|--------|-------------|
| `getBlockedAddressSet(address)` | Returns `Set<string>` of all addresses blocked by or blocking `address`. Use in feed pipelines. |
| `isBlockedBetween(a, b)` | Returns `boolean`. Use in any point-to-point interaction guard. |
| `getBlockStatus(viewer, target)` | Returns `{ youBlocked, blockedYou }`. Use in profile views. |

---

## Edge cases & design decisions

| Scenario | Behaviour |
|----------|-----------|
| Blocking someone who already blocked you | Both `youBlocked` and `blockedYou` become true. Effects are the same. |
| Blocking someone you follow | The follow record is **kept**. Unfollow separately if desired. Feed filtering still removes their posts. |
| Unblocking | All restrictions are lifted immediately. Previous block record is hard-deleted. |
| Concurrent blocks | The unique index on `(blockerAddress, blockedAddress)` guarantees atomicity. A race condition returns a graceful `200 already blocked`. |
| Self-block | Rejected with `400 You cannot block yourself`. |
| Admin-initiated global blocks | These use the legacy `UserReportModel` with `ACTION_TYPE.BLOCKED` and are handled separately by the admin system. They are not affected by this system. |
| Group DMs | Platform-level blocks do not remove users from group conversations (different semantics). Use the per-conversation `POST /dm/block` endpoint for that. |
