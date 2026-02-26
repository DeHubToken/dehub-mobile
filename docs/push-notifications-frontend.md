# Notifications - Frontend Implementation Guide

## Overview

DeHub has a two-channel notification system:

1. **In-App Notifications** — Stored in the database, queried via REST API, delivered in real-time via Socket.IO events. These are the notification bell / notifications screen.
2. **Push Notifications** — Delivered via Expo Push Notifications to the device even when the app is in the background.

Both channels use the same 22 notification types and 6 categories. This document covers everything the frontend needs to implement both channels.

> **Last updated:** 19 Feb 2026 — audited against actual backend code.

## Notification Types (Enums)

All notification types are defined as TypeScript enums in `src/notification/notification.enums.ts`:

```typescript
enum NotificationType {
  // Engagement
  LIKE = 'like',
  DISLIKE = 'dislike',           // Internal only — never pushed
  COMMENT = 'comment',
  COMMENT_REPLY = 'comment_reply',
  COMMENT_LIKE = 'comment_like',
  REPOST = 'repost',
  QUOTE = 'quote',

  // Social
  FOLLOWING = 'following',
  FOLLOW_REQUEST = 'follow_request',
  FOLLOW_REQUEST_ACCEPTED = 'follow_request_accepted',
  MENTION = 'mention',           // Defined — NOT YET IMPLEMENTED

  // Monetization
  TIP = 'tip',
  SUBSCRIPTION = 'subscription',
  PPV_PURCHASE = 'ppv_purchase',
  BOUNTY_AVAILABLE = 'bounty_available',
  BOUNTY_CLAIMED = 'bounty_claimed',

  // Content
  VIDEO_MILESTONE = 'video_milestone',
  LIVESTREAM_START = 'livestream_start',

  // Messages
  NEW_MESSAGE = 'new_message',

  // System
  VIDEO_REMOVAL = 'video_removal',
  ACCOUNT_WARNING = 'account_warning',
  SYSTEM = 'system',
}
```

```typescript
enum NotificationCategory {
  ENGAGEMENT = 'engagement',
  SOCIAL = 'social',
  MONETIZATION = 'monetization',
  CONTENT = 'content',
  MESSAGES = 'messages',
  SYSTEM = 'system',
}
```

```typescript
enum PushNotificationAction {
  OPEN_CONTENT = 'open_content',
  OPEN_COMMENT = 'open_comment',
  OPEN_PROFILE = 'open_profile',
  OPEN_LIVESTREAM = 'open_livestream',
  OPEN_CONVERSATION = 'open_conversation',
  OPEN_WALLET = 'open_wallet',
  OPEN_SUBSCRIBERS = 'open_subscribers',
  OPEN_NOTIFICATIONS = 'open_notifications',
  OPEN_BOUNTY_CLAIM = 'open_bounty_claim',
}
```

## In-App Notifications

In-app notifications are stored in MongoDB and accessed via REST API. They provide persistent notification history and support aggregation, categories, and read/unread state.

> **Note:** Direct messages (`new_message`) do **not** create in-app notifications. DMs are handled entirely through the DM UI and push notifications. The `messages` category exists in the enum but will not appear in the in-app notification feed.

### Notification Object Schema

Each in-app notification has this shape:

```typescript
interface InAppNotification {
  _id: string;                      // MongoDB ObjectId
  address: string;                  // Recipient wallet address
  type: NotificationType;           // e.g. 'like', 'repost', 'quote'
  category: NotificationCategory;   // e.g. 'engagement', 'social'
  content: string;                  // Pre-rendered display text

  // Actor info (who triggered it)
  actorAddress?: string;
  actorUsername?: string;
  actorAvatar?: string;
  actor?: UserReference;            // Populated user ref (preferred)

  // Content reference
  tokenId?: number;
  tokenTitle?: string;
  tokenThumbnail?: string;
  postType?: 'video' | 'feed-images' | 'feed-simple';

  // Comment reference
  commentId?: number;
  commentPreview?: string;
  parentCommentId?: number;

  // Aggregation
  aggregationKey?: string;
  aggregatedCount: number;          // Total count (1 = single)
  latestActorNames: string[];       // Up to 3 most recent actor usernames
  latestActorUsers?: UserReference[]; // Populated user refs (preferred)

  // Monetization
  amount?: number;
  currency?: string;
  planName?: string;
  planId?: string;

  // Extra
  metadata?: Record<string, any>;   // deepLink, bountyType, moderationType, etc.

  // Status
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### Metadata by Type

The `metadata` field carries type-specific data:

| Type | Metadata Fields |
|------|-----------------|
| `repost` | `{ deepLink }` |
| `quote` | `{ quoteTokenId, deepLink }` |
| `follow_request` | `{ action: 'follow_request', followId }` — render accept/reject buttons |
| `bounty_available` / `bounty_claimed` | `{ bountyType: 'viewer' \| 'commentor', deepLink }` |
| `comment_like` | `{ aggregatedCount, deepLink }` |
| `video_milestone` | `{ milestone, type: 'views' \| 'likes' }` |
| `account_warning` | `{ moderationType }` — see Moderation Subtypes below |
| All types | May include `{ deepLink }` for navigation |

### Aggregation

Certain notification types are **aggregated** — multiple events are merged into a single notification with an incrementing count instead of creating separate entries.

**Aggregated types:** `like`, `comment`, `following`, `comment_like`, `repost`

Example: If 6 users like the same video, the notification shows:
- `content`: `"CryptoKing, NFTQueen and 4 others liked your video"`
- `aggregatedCount`: `6`
- `latestActorNames`: `["CryptoKing", "NFTQueen", "Web3Dev"]`

Display pattern:
```typescript
function formatNotification(n: InAppNotification): string {
  // content is pre-rendered by the backend — use it directly
  return n.content;

  // If you need custom formatting with actor names:
  if (n.aggregatedCount <= 1) return `${n.actorUsername} liked your video`;
  if (n.aggregatedCount === 2) return `${n.latestActorNames[0]} and ${n.latestActorNames[1]} liked your video`;
  return `${n.latestActorNames[0]} and ${n.aggregatedCount - 1} others liked your video`;
}
```

### REST API Endpoints

#### `GET /notification` — Fetch notifications

Query params:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `unreadOnly` | boolean | `true` | Set to `"false"` to get all notifications |
| `category` | string | — | Filter: `engagement`, `social`, `monetization`, `content`, `messages`, `system` |
| `page` | number | `1` | Page number (1-indexed) |
| `limit` | number | `30` | Items per page (max 100) |

Response:
```json
{
  "result": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "address": "0x1234...",
      "type": "repost",
      "category": "engagement",
      "content": "CryptoKing and 2 others reposted your video \"My NFT Drop\"",
      "actorUsername": "CryptoKing",
      "actorAvatar": "https://cdn.dehub.com/avatars/abc.jpg",
      "tokenId": 12345,
      "tokenTitle": "My NFT Drop",
      "postType": "video",
      "aggregatedCount": 3,
      "latestActorNames": ["CryptoKing", "NFTQueen", "Web3Dev"],
      "read": false,
      "createdAt": "2026-01-21T15:30:00.000Z",
      "updatedAt": "2026-01-21T16:45:00.000Z"
    },
    {
      "_id": "507f1f77bcf86cd799439013",
      "type": "quote",
      "category": "engagement",
      "content": "CryptoKing quoted your video \"My NFT Drop\"",
      "actorUsername": "CryptoKing",
      "tokenId": 12345,
      "postType": "video",
      "metadata": {
        "quoteTokenId": 67890,
        "deepLink": "/video/67890"
      },
      "aggregatedCount": 1,
      "read": false,
      "createdAt": "2026-01-21T14:30:00.000Z"
    }
  ]
}
```

#### `GET /notification/unread-count` — Badge count

Response:
```json
{
  "total": 15,
  "byCategory": {
    "engagement": 8,
    "social": 3,
    "monetization": 2,
    "content": 1,
    "messages": 0,
    "system": 1
  }
}
```

Use `total` for the notification bell badge. Use `byCategory` for category tab badges.

#### `PATCH /notification/:notificationId` — Mark one as read

Response: `{ "message": "Notification marked as read" }`

#### `POST /notification/mark-all-read` — Mark all as read

Optional query param `category` to only clear specific category.

Response: `{ "message": "All notifications marked as read", "count": 12 }`

### Socket.IO Real-Time Events

The backend emits a Socket.IO event when a new notification is created:

```typescript
// Listen for new notifications
socket.on('notification', (data: InAppNotification) => {
  // Add to notification list
  addNotificationToList(data);
  // Increment badge count
  incrementBadgeCount();
  // Optionally show an in-app toast
  showToast(data.content);
});
```

### In-App Navigation by Type

When a user taps a notification in the notifications list:

```typescript
function navigateFromNotification(n: InAppNotification) {
  switch (n.type) {
    case 'like':
    case 'comment':
    case 'comment_reply':
    case 'comment_like':
    case 'repost':
    case 'video_milestone':
    case 'ppv_purchase':
    case 'bounty_claimed':
      navigateTo('VideoScreen', { tokenId: n.tokenId, commentId: n.commentId });
      break;

    case 'quote':
      navigateTo('VideoScreen', { tokenId: n.metadata?.quoteTokenId || n.tokenId });
      break;

    case 'following':
    case 'follow_request':
    case 'follow_request_accepted':
      navigateTo('ProfileScreen', { address: n.actorAddress });
      break;

    case 'tip':
    case 'bounty_available':
      if (n.tokenId) navigateTo('VideoScreen', { tokenId: n.tokenId });
      else navigateTo('WalletScreen');
      break;

    case 'subscription':
      navigateTo('SubscribersScreen');
      break;

    case 'livestream_start':
      navigateTo('LivestreamScreen', { tokenId: n.tokenId });
      break;

    // NOTE: new_message is push-only — no in-app notifications for DMs

    case 'video_removal':
    case 'account_warning':
    case 'system':
    default:
      navigateTo('NotificationsScreen');
  }
}
```

### Follow Request Actions

For `follow_request` notifications, render accept/reject buttons:

```typescript
function renderFollowRequestNotification(notification: InAppNotification) {
  const { followId } = notification.metadata || {};

  return (
    <View>
      <Text>{notification.content}</Text>
      {notification.metadata?.action === 'follow_request' && (
        <View>
          <Button title="Accept" onPress={() => acceptFollowRequest(followId)} />
          <Button title="Decline" onPress={() => rejectFollowRequest(followId)} />
        </View>
      )}
    </View>
  );
}
```

### Moderation Subtypes

For `account_warning` notifications, `metadata.moderationType` distinguishes the action:

| moderationType | Meaning |
|----------------|---------|
| `account_banned` | Account suspended |
| `account_unbanned` | Suspension lifted |
| `posting_restricted` | Posting ability restricted |
| `posting_restored` | Posting ability restored |
| `commenting_restricted` | Commenting restricted |
| `commenting_restored` | Commenting restored |
| `account_warning` | General warning |

---

## Push Notifications

Push notifications are delivered via Expo Push Notifications to the device. They use the same notification types as in-app but carry a simplified payload optimized for OS-level display.

### Push Notification Payload Structure

All push notifications follow this structure:

```typescript
interface PushNotificationPayload {
  title: string;
  body: string;
  data: {
    type: NotificationType;
    category: NotificationCategory;
    deepLink: string;
    [key: string]: any;
  };
}
```

### Push Notification Types and Handling

#### 1. Engagement Notifications

#### `like` — Someone liked your content

```json
{
  "title": "New Like ❤️",
  "body": "John liked your video: \"My First Stream\"",
  "data": {
    "type": "like",
    "category": "engagement",
    "tokenId": 123,
    "deepLink": "/video/123"
  }
}
```

Preference: `engagement.likes`

#### `dislike` — Internal only

Push notifications are **never sent** for dislikes. The type exists in the enum for in-app notification records only.

#### `comment` — Someone commented on your content

```json
{
  "title": "New Comment 💬",
  "body": "John: \"Great content!...\"",
  "data": {
    "type": "comment",
    "category": "engagement",
    "tokenId": 123,
    "commentId": 456,
    "deepLink": "/video/123?comment=456"
  }
}
```

Preference: `engagement.comments`

#### `comment_reply` — Someone replied to your comment

```json
{
  "title": "New Reply 💬",
  "body": "John replied: \"Thanks for watching!...\"",
  "data": {
    "type": "comment_reply",
    "category": "engagement",
    "tokenId": 123,
    "commentId": 456,
    "deepLink": "/video/123?comment=456"
  }
}
```

Preference: `engagement.commentReplies`

#### `comment_like` — Someone liked your comment (Aggregated)

```json
{
  "title": "Comment Liked ❤️",
  "body": "John liked your comment \"Great video!...\"",
  "data": {
    "type": "comment_like",
    "category": "engagement",
    "tokenId": 123,
    "commentId": 456,
    "aggregatedCount": 6,
    "deepLink": "/video/123?comment=456"
  }
}
```

When aggregated: `"John and 5 others liked your comment \"Great vi...\""`.

Preference: `engagement.likes`

#### `repost` — Someone reposted your content (Aggregated)

```json
{
  "title": "New Repost 🔁",
  "body": "John reposted your video: \"My First Stream\"",
  "data": {
    "type": "repost",
    "category": "engagement",
    "tokenId": 123,
    "aggregatedCount": 3,
    "deepLink": "/video/123"
  }
}
```

When aggregated: `"John and 2 others reposted your video"`. `tokenId` is the original post that was reposted. Navigate to the original post.

Preference: `engagement.likes`

#### `quote` — Someone quoted your content

```json
{
  "title": "New Quote Post ✍️",
  "body": "John quoted your video: \"My First Stream\"",
  "data": {
    "type": "quote",
    "category": "engagement",
    "tokenId": 123,
    "quoteTokenId": 789,
    "deepLink": "/video/789"
  }
}
```

`tokenId` is the original post. `quoteTokenId` is the new quote post token. Navigate to the **quote post** (quoteTokenId), not the original.

Preference: `engagement.likes`

#### 2. Social Notifications

#### `following` — Someone followed you (public account)

```json
{
  "title": "New Follower 👋",
  "body": "John started following you",
  "data": {
    "type": "following",
    "category": "social",
    "actorAddress": "0x123...",
    "deepLink": "/profile/0x123..."
  }
}
```

Preference: `social.newFollowers`

#### `follow_request` — Someone requested to follow you (private account)

```json
{
  "title": "Follow Request",
  "body": "John requested to follow you",
  "data": {
    "type": "follow_request",
    "category": "social",
    "deepLink": "/profile/0x123..."
  }
}
```

In-app metadata includes `{ action: 'follow_request', followId: '<ObjectId>' }` — use this to render accept/reject buttons.

Preference: `social.newFollowers`

#### `follow_request_accepted` — Your follow request was accepted

```json
{
  "title": "Follow Request Accepted",
  "body": "Jane accepted your follow request",
  "data": {
    "type": "follow_request_accepted",
    "category": "social",
    "deepLink": "/profile/jane"
  }
}
```

Preference: `social.newFollowers`

#### `mention` — Someone mentioned you

**Not yet implemented.** The enum exists but no backend code sends this type. Reserved for a future release.

#### 3. Monetization Notifications

#### `tip` — Someone tipped you

```json
{
  "title": "You received a tip! 💰",
  "body": "John tipped you 10 DHB",
  "data": {
    "type": "tip",
    "category": "monetization",
    "tokenId": 123,
    "deepLink": "/video/123"
  }
}
```

If no tokenId, deepLink defaults to `"/wallet"`.

Preference: `monetization.tips`

#### `subscription` — Someone subscribed to you

```json
{
  "title": "New Subscriber! 🎉",
  "body": "John subscribed to your Premium plan",
  "data": {
    "type": "subscription",
    "category": "monetization",
    "planId": "premium",
    "deepLink": "/dashboard/subscribers"
  }
}
```

Preference: `monetization.subscriptions`

#### `ppv_purchase` — Someone purchased your PPV content

```json
{
  "title": "Content Purchased! 💵",
  "body": "John purchased \"Exclusive Video\" for 5 DHB",
  "data": {
    "type": "ppv_purchase",
    "category": "monetization",
    "tokenId": 123,
    "deepLink": "/video/123"
  }
}
```

Preference: `monetization.ppvPurchases`

#### `bounty_available` — You have a bounty to claim

```json
{
  "title": "Bounty Available! 💰",
  "body": "You have a viewer bounty to claim on \"Viral Video\"",
  "data": {
    "type": "bounty_available",
    "category": "monetization",
    "tokenId": 123,
    "bountyType": "viewer",
    "deepLink": "/video/123?claimBounty=true"
  }
}
```

`bountyType` is either `"viewer"` or `"commentor"`.

Preference: `monetization.tips`

#### `bounty_claimed` — Someone claimed a bounty on your video

```json
{
  "title": "Bounty Claimed",
  "body": "John claimed a viewer bounty of 10 DHB on \"Viral Video\"",
  "data": {
    "type": "bounty_claimed",
    "category": "monetization",
    "tokenId": 123,
    "amount": 10,
    "bountyType": "viewer",
    "deepLink": "/video/123"
  }
}
```

Preference: `monetization.tips`

#### 4. Content Notifications

#### `livestream_start` — Someone you follow started streaming

```json
{
  "title": "John is Live! 🔴",
  "body": "Late Night Gaming",
  "data": {
    "type": "livestream_start",
    "category": "content",
    "tokenId": 456,
    "deepLink": "/live/456"
  }
}
```

Title is dynamic and includes the streamer name. Body is the stream title, or fallback: `"John started a livestream"`. Sent as a bulk push to all followers. `tokenId` is included (not `streamId`). If no tokenId, deepLink falls back to `"/profile/john"`.

Preference: `content.livestreamStart`

#### `video_milestone` — Your video reached a milestone

```json
{
  "title": "Milestone Reached!",
  "body": "🎉 My First Stream reached 1000 views!",
  "data": {
    "type": "video_milestone",
    "category": "content",
    "tokenId": 123,
    "milestone": "1000",
    "deepLink": "/video/123"
  }
}
```

Preference: `content.milestones`

#### 5. Message Notifications

#### `new_message` — New direct message

```json
{
  "title": "New Message 💬",
  "body": "John: \"Hey, great stream yesterday!...\"",
  "data": {
    "type": "new_message",
    "category": "messages",
    "conversationId": "conv_123",
    "conversationType": "dm",
    "senderName": "John",
    "deepLink": "/dm/conv_123"
  }
}
```

`conversationType` is either `"dm"` or `"group"`. Body falls back to `"John sent you a message"` when no preview is available.

Preference: Always allowed (DM settings are controlled separately).

#### 6. System Notifications

#### `video_removal` — Your content was removed

```json
{
  "title": "Content Update",
  "body": "Your video was removed due to policy violation. Contact support to appeal.",
  "data": {
    "type": "video_removal",
    "category": "system",
    "action": "open_notifications",
    "deepLink": "/notifications"
  }
}
```

Preference: `system.accountAlerts` — bypassed for moderation actions (sent with `force: true`).

#### `account_warning` — Account warning or moderation action

Used for all account-level moderation actions. The in-app notification `metadata.moderationType` field distinguishes the specific action.

```json
{
  "title": "Account Notice",
  "body": "Your account has been suspended for violating our Community Guidelines...",
  "data": {
    "type": "account_warning",
    "category": "system",
    "action": "open_notifications",
    "deepLink": "/settings/account"
  }
}
```

Moderation subtypes (stored in in-app notification `metadata.moderationType`):

- `account_banned` — Account suspended
- `account_unbanned` — Suspension lifted
- `posting_restricted` — Posting ability restricted
- `posting_restored` — Posting ability restored
- `commenting_restricted` — Commenting ability restricted
- `commenting_restored` — Commenting ability restored
- `account_warning` — General warning

Preference: `system.accountAlerts` — bypassed for moderation actions (sent with `force: true`).

#### `system` — General system notification

```json
{
  "title": "DeHub",
  "body": "We have updated our terms of service. Please review the changes.",
  "data": {
    "type": "system",
    "category": "system",
    "articleUrl": "https://dehub.app/terms",
    "broadcastId": "broadcast_123",
    "deepLink": "/notifications"
  }
}
```

Preference: `system.announcements` — bypassed for broadcasts (sent with `force: true`).

## Implementation Status Summary

| Type | Push Sent | data.type | Preference Key |
|------|-----------|-----------|----------------|
| `like` | Yes | `like` | `engagement.likes` |
| `dislike` | Never | — | — |
| `comment` | Yes | `comment` | `engagement.comments` |
| `comment_reply` | Yes | `comment_reply` | `engagement.commentReplies` |
| `comment_like` | Yes | `comment_like` | `engagement.likes` |
| `repost` | Yes (aggregated) | `repost` | `engagement.likes` |
| `quote` | Yes | `quote` | `engagement.likes` |
| `following` | Yes | `following` | `social.newFollowers` |
| `follow_request` | Yes | `follow_request` | `social.newFollowers` |
| `follow_request_accepted` | Yes | `follow_request_accepted` | `social.newFollowers` |
| `mention` | Not implemented | — | `engagement.mentions` |
| `tip` | Yes | `tip` | `monetization.tips` |
| `subscription` | Yes | `subscription` | `monetization.subscriptions` |
| `ppv_purchase` | Yes | `ppv_purchase` | `monetization.ppvPurchases` |
| `bounty_available` | Yes | `bounty_available` | `monetization.tips` |
| `bounty_claimed` | Yes | `bounty_claimed` | `monetization.tips` |
| `video_milestone` | Yes | `video_milestone` | `content.milestones` |
| `livestream_start` | Yes (bulk) | `livestream_start` | `content.livestreamStart` |
| `new_message` | Yes | `new_message` | Always allowed |
| `video_removal` | Yes (force) | `video_removal` | `system.accountAlerts` |
| `account_warning` | Yes (force) | `account_warning` | `system.accountAlerts` |
| `system` | Yes (force) | `system` | `system.announcements` |

### Push Implementation

#### Deep Link Routing (Push Tap Handler)

When a push notification is tapped, use the `deepLink` field to navigate:

```typescript
import * as Notifications from 'expo-notifications';

Notifications.addNotificationResponseReceivedListener(response => {
  const data = response.notification.request.content.data;

  if (data.deepLink) {
    navigation.navigate(parseDeepLink(data.deepLink));
  } else {
    // Fallback: use type-based routing (same switch as In-App Navigation above)
    navigateFromNotificationType(data);
  }
});

function parseDeepLink(deepLink: string) {
  const routes = {
    '/video/:id': 'VideoScreen',
    '/live/:id': 'LivestreamScreen',
    '/dm/:id': 'ConversationScreen',
    '/profile/:identifier': 'ProfileScreen',
    '/wallet': 'WalletScreen',
    '/dashboard/subscribers': 'SubscribersScreen',
    '/settings/account': 'AccountSettingsScreen',
    '/notifications': 'NotificationsScreen',
  };
  // Parse and return appropriate screen/params
  // Handle query params: ?comment=456, ?claimBounty=true
}
```

#### User Preferences

Users can configure notification preferences at `/settings/notifications`. The backend respects these before sending push.

Available preference groups:

| Group | Keys | Covers |
|-------|------|--------|
| **engagement** | `likes`, `comments`, `commentReplies`, `mentions` | like, comment, comment_reply, comment_like, repost, quote |
| **social** | `newFollowers` | following, follow_request, follow_request_accepted |
| **monetization** | `tips`, `subscriptions`, `ppvPurchases` | tip, bounty_available, bounty_claimed, subscription, ppv_purchase |
| **content** | `milestones`, `livestreamStart` | video_milestone, livestream_start |
| **system** | `accountAlerts`, `announcements` | video_removal, account_warning, system |

System and moderation notifications (`video_removal`, `account_warning`, broadcast `system`) bypass user preferences and are always delivered.

Messages (`new_message`) are always allowed — DM notification settings are controlled separately.

## Testing

### Expo Development

```bash
expo notifications:push --to ExponentPushToken[xxx] \
  --title "Test" \
  --body "Test notification" \
  --data '{"type":"system","category":"system","deepLink":"/notifications"}'
```

### API Testing

Admin endpoint for testing (requires admin auth):

```bash
curl -X POST https://api.dehub.app/admin/notifications/test \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "type": "like",
    "tokenId": 456
  }'
```

## Error Handling

Push notifications may fail silently. The backend logs failures but does not retry. Frontend should:

1. Always have in-app notifications as a fallback
2. Periodically sync notification count via API
3. Handle cases where push token expires

## Migration Notes

If upgrading from an older notification system:

- Old `type` values are still supported for backward compatibility
- `category` field is always included (the `messages` category was recently added to the Mongoose schema)
- `deepLink` replaces old navigation hints
- `data.type` now correctly reflects the real notification type for all types including `video_milestone`, `video_removal`, `account_warning`, `follow_request`, and `follow_request_accepted` (previously these were incorrectly overridden to `system`)
- Aggregated notifications now include `aggregatedCount` instead of inline text

## Contact

For issues with push notifications, contact the backend team or check logs in the admin dashboard.
