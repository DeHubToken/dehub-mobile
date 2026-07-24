# Session & Device Management — Frontend Integration Guide

> Lets users view their active sessions, remotely log out specific devices, and sign out of all other devices — similar to Google, Apple, and Netflix.

---

## Overview

Every time a user authenticates (`POST /web/auth` or `POST /mobile/auth`), a **session record** is created containing device metadata (name, platform, OS version, IP, etc.). Sessions are tied to refresh token families — when all refresh tokens for a device are revoked, the session is considered inactive.

Three new endpoints let users manage their sessions:

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/auth/sessions` | `GET` | Bearer | List all active devices |
| `/auth/sessions/:deviceId` | `DELETE` | Bearer | Remotely log out one device |
| `/auth/sessions/revoke-others` | `POST` | Bearer | Log out all devices except current |

---

## Prerequisites

### Device Identification

The backend identifies the calling device using the `X-Device-Id` header:

- **Mobile apps**: Should already send `X-Device-Id` as a persistent UUID (e.g. `A1B2C3D4-E5F6-7890-AB12-CD34EF567890`).
- **Web clients**: If the header is absent, the backend defaults to `"web"`. For multi-tab support with distinct sessions, generate and persist a UUID in `localStorage`.

**All CORS-allowed device headers** (already configured):
```
X-Client-Type, X-Platform, X-Device-Id, X-Device-Name, X-App-Version, X-OS-Version
```

### Authentication

All three endpoints require the `Authorization: Bearer <accessToken>` header (standard `AuthGuard`).

---

## Endpoints

### 1. `GET /auth/sessions` — List Active Devices

Returns all sessions that have at least one non-revoked, non-expired refresh token. Ordered by most recently active first.

**Headers:**
```
Authorization: Bearer <accessToken>
X-Device-Id: <deviceUUID>          # optional, used to mark `current`
```

**Response (200):**
```json
{
  "status": true,
  "sessions": [
    {
      "deviceId": "A1B2C3D4-E5F6-7890-AB12-CD34EF567890",
      "deviceName": "iPhone 15 Pro",
      "platform": "ios",
      "appVersion": "2.1.0",
      "osVersion": "17.2",
      "ip": "203.0.113.42",
      "lastActiveAt": "2026-04-12T10:30:00.000Z",
      "createdAt": "2026-03-15T08:00:00.000Z",
      "current": true
    },
    {
      "deviceId": "web",
      "deviceName": null,
      "platform": "web",
      "appVersion": null,
      "osVersion": null,
      "ip": "198.51.100.17",
      "lastActiveAt": "2026-04-11T22:15:00.000Z",
      "createdAt": "2026-04-01T12:00:00.000Z",
      "current": false
    }
  ]
}
```

**Session fields:**

| Field | Type | Description |
|---|---|---|
| `deviceId` | `string` | Unique device identifier (UUID for mobile, `"web"` for web) |
| `deviceName` | `string \| null` | Human-readable name (e.g. "iPhone 15 Pro", "Pixel 8"). Null for web. Comes from `X-Device-Name` header. |
| `platform` | `"ios" \| "android" \| "web"` | Device platform |
| `appVersion` | `string \| null` | App version from `X-App-Version` header |
| `osVersion` | `string \| null` | OS version from `X-OS-Version` header |
| `ip` | `string \| null` | IP address at last login/refresh |
| `lastActiveAt` | `ISO 8601` | Last token refresh or login time |
| `createdAt` | `ISO 8601` | When this session was first created |
| `current` | `boolean` | `true` if this session's `deviceId` matches the caller's `X-Device-Id` |

**Note:** `userAgent` is intentionally excluded from the response — `deviceName`, `platform`, and `osVersion` provide cleaner display data.

---

### 2. `DELETE /auth/sessions/:deviceId` — Revoke a Specific Device

Remotely log out a single device. Revokes all refresh tokens for that device and deletes the session record.

**Headers:**
```
Authorization: Bearer <accessToken>
X-Device-Id: <callerDeviceUUID>    # used to prevent self-revocation
```

**URL Parameter:**
- `:deviceId` — The `deviceId` of the session to revoke (from the list endpoint).

**Response (200):**
```json
{
  "status": true,
  "message": "Session revoked successfully"
}
```

**Error — Self-revocation blocked (400):**
```json
{
  "status": false,
  "error": true,
  "message": "Cannot revoke your current session. Use POST /auth/logout instead."
}
```

**Error — Session not found (404):**
```json
{
  "status": false,
  "error": true,
  "message": "Session not found"
}
```

**Why self-revocation is blocked:** Revoking your own session via this endpoint would leave the client in a broken state (access token still works for up to 15 min, but refresh will fail). Use `POST /auth/logout` instead which properly handles self-logout.

---

### 3. `POST /auth/sessions/revoke-others` — Log Out All Other Devices

Revoke every session except the one belonging to the provided refresh token. The caller stays logged in.

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Request body:**
```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

**Response (200):**
```json
{
  "status": true,
  "message": "All other sessions revoked",
  "revokedCount": 3
}
```

The `revokedCount` is the number of refresh token families that were revoked (roughly equals the number of other devices logged out).

---

## Frontend Implementation

### React Native / Mobile

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

// Already sent on login — make sure these headers are on ALL auth requests
const deviceHeaders = {
  'X-Device-Id': await DeviceInfo.getUniqueId(),
  'X-Device-Name': await DeviceInfo.getDeviceName(),     // "iPhone 15 Pro"
  'X-Platform': Platform.OS,                              // "ios" | "android"
  'X-App-Version': DeviceInfo.getVersion(),               // "2.1.0"
  'X-OS-Version': Platform.Version.toString(),            // "17.2"
};
```

### Active Sessions Screen

```typescript
interface Session {
  deviceId: string;
  deviceName: string | null;
  platform: 'ios' | 'android' | 'web';
  appVersion: string | null;
  osVersion: string | null;
  ip: string | null;
  lastActiveAt: string;
  createdAt: string;
  current: boolean;
}

// Fetch all active sessions
async function fetchSessions(): Promise<Session[]> {
  const res = await api.get('/auth/sessions');
  return res.data.sessions;
}

// Revoke a specific device
async function revokeDevice(deviceId: string): Promise<void> {
  await api.delete(`/auth/sessions/${encodeURIComponent(deviceId)}`);
}

// Revoke all other devices
async function revokeOthers(): Promise<number> {
  const refreshToken = await AsyncStorage.getItem('refreshToken');
  const res = await api.post('/auth/sessions/revoke-others', { refreshToken });
  return res.data.revokedCount;
}
```

### Web (React / Next.js)

```typescript
// Generate persistent device ID for web
function getWebDeviceId(): string {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('deviceId', id);
  }
  return id;
}

// Add to your Axios instance
api.interceptors.request.use((config) => {
  config.headers['X-Device-Id'] = getWebDeviceId();
  return config;
});
```

### UI Recommendations

#### Session List Item

```
┌─────────────────────────────────────────────┐
│  📱 iPhone 15 Pro                  ● Current │
│  iOS 17.2 · DeHub 2.1.0                     │
│  Last active: 2 minutes ago                  │
│  IP: 203.0.113.42                            │
├─────────────────────────────────────────────┤
│  🌐 Web Browser                              │
│  Web                                         │
│  Last active: 14 hours ago                   │
│  IP: 198.51.100.17                           │
│                              [Log Out] button│
└─────────────────────────────────────────────┘
```

- Mark the current session with a "Current" badge — don't show the "Log Out" button for it.
- Show a "Log Out All Other Devices" button at the bottom.
- Use relative time for `lastActiveAt` (e.g. "2 minutes ago", "3 days ago").
- Show platform icons: 📱 for iOS/Android, 🌐 for web.
- Use `deviceName` when available, fall back to platform name ("Web Browser", "Android Device").

#### Platform-Specific Icons

| `platform` | Display Name | Icon |
|---|---|---|
| `ios` | deviceName or "iPhone" | Apple icon |
| `android` | deviceName or "Android Device" | Android icon |
| `web` | "Web Browser" | Globe icon |

---

## Related Endpoints

These existing endpoints complement the session management flow:

| Endpoint | Purpose |
|---|---|
| `POST /auth/logout` | Log out current device (revoke your own refresh token) |
| `POST /auth/logout-all` | Nuclear option — revoke ALL sessions including current |
| `POST /auth/refresh` | Refresh access token (updates `lastActiveAt` on the session) |

---

## How It Works Internally

1. **Login** → upserts a `UserSession` record keyed by `{ address, deviceId }` and creates a `RefreshToken` with a `family` UUID.
2. **Token refresh** → updates `lastActiveAt` on the matching `UserSession`.
3. **`GET /auth/sessions`** → queries `RefreshTokenModel` for distinct `deviceId`s with active (non-revoked, non-expired) tokens, then joins with `UserSessionModel` for metadata.
4. **`DELETE /auth/sessions/:deviceId`** → revokes all `RefreshToken` documents for that `{ address, deviceId }`, deletes the `UserSession` record.
5. **`POST /auth/sessions/revoke-others`** → identifies the current session's `family` from the provided refresh token, revokes all other families, deletes all other session records.

### What "revoking" means

- The refresh token family is marked `revoked: true` — the device can no longer refresh.
- The existing access token on the revoked device **continues working for up to 15 minutes** (its natural expiry). This is inherent to JWT-based auth.
- The `UserSession` record is deleted — the device disappears from the sessions list immediately.

---

## Error Handling

| Status | When | Action |
|---|---|---|
| `200` | Success | Update UI accordingly |
| `400` | Tried to revoke own session | Show message: "Use logout for current device" |
| `401` | Access token expired | Refresh token, retry |
| `404` | Device already logged out | Refresh the sessions list |

---

## Security Notes

- **IP addresses** are captured from the `X-Forwarded-For` / `X-Real-IP` headers at login and refresh time. They reflect the user's network at that moment, not real-time location.
- **Session metadata** (deviceName, appVersion, etc.) comes from client-supplied headers. It cannot be considered fully trustworthy, but is useful for display.
- **No push notification** is sent to the revoked device — the user on that device will simply fail to refresh when their access token expires.
- **Remote revocation is logged** as a `LOGOUT` activity with `metadata: { remote: true }` to distinguish from self-initiated logouts.
