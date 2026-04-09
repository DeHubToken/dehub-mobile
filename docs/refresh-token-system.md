# Refresh Token System — Frontend Integration Guide

## Overview

The authentication system now uses **short-lived access tokens** (15 min) paired with **refresh tokens** (7 days web / 30 days mobile). This replaces the old single-token system where web tokens lasted 24 hours and mobile tokens lasted 1 year.

## Breaking Changes?

**No.** The implementation is backward-compatible:

| What | Before | After |
|---|---|---|
| Login response field `token` | ✅ Still present | ✅ Still present (same field, shorter TTL) |
| `Authorization: Bearer <token>` | ✅ Works | ✅ Works (same header) |
| Login endpoints | `POST /web/auth`, `POST /mobile/auth` | Same endpoints, same params |
| Wallet signature flow | Same | Same |

**What's new in the login response** (additive, non-breaking):

```json
{
  "status": true,
  "token": "eyJhbG...",          // ← still here, now 15-min TTL
  "refreshToken": "a1b2c3d4...", // ← NEW: store this securely
  "expiresIn": 900,              // ← NEW: seconds until token expires
  "user": { ... },
  "result": {
    "tokenExpiry": "15 minutes",       // ← changed from "24 hours" / "1 year"
    "refreshTokenExpiry": "7 days",    // ← NEW (or "30 days" for mobile)
    ...
  }
}
```

> **Important field-name difference:** The login endpoints (`/web/auth`, `/mobile/auth`) return the access token as `token`, while the refresh endpoint (`/auth/refresh`) returns it as `accessToken`. Handle both in your token storage logic.

**If the frontend does nothing**: Users will start getting 401 errors after 15 minutes instead of 24 hours. They'd need to re-sign with their wallet. This is why you should implement the refresh flow.

---

## New Endpoints

### `POST /auth/refresh`

Exchange a valid refresh token for a new access token + refresh token pair. **No authentication header required.**

**Request:**
```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

**Response (200):**
```json
{
  "status": true,
  "accessToken": "eyJhbG...",
  "refreshToken": "x9y8z7...",
  "expiresIn": 900
}
```

**Error (401):**
```json
{
  "status": false,
  "error": true,
  "message": "Refresh token reuse detected — all sessions revoked. Please log in again."
}
```

### `POST /auth/logout`

Revoke the current session's refresh token. Requires `Authorization: Bearer <accessToken>` header.

**Request:**
```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

**Response:**
```json
{
  "status": true,
  "message": "Logged out successfully"
}
```

### `POST /auth/logout-all`

Revoke ALL refresh tokens for the user (all devices). Requires `Authorization: Bearer <accessToken>` header.

**Request:** Empty body (just the auth header).

**Response:**
```json
{
  "status": true,
  "message": "All sessions revoked successfully"
}
```

---

## Frontend Implementation Guide

### 1. Update Login Handler

```typescript
// After calling POST /web/auth or POST /mobile/auth
const { token, refreshToken, expiresIn } = response.data;

// Store the access token (field is called "token" from login, "accessToken" from refresh)
setAccessToken(token);

// NEW: Store the refresh token securely
// Web: Use httpOnly cookie (preferred) or localStorage
// Mobile: Use secure storage (expo-secure-store, react-native-keychain)
setRefreshToken(refreshToken);

// NEW: Track when the token expires
const expiresAt = Date.now() + expiresIn * 1000;
setTokenExpiresAt(expiresAt);
```

### 2. Add an Axios/Fetch Interceptor for Automatic Refresh

This is the core of the implementation. Intercept 401 responses and transparently refresh the token:

```typescript
// --- Axios example ---

let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

function processQueue(error: any, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Don't retry the refresh endpoint itself
    if (error.response?.status !== 401 || originalRequest.url === '/auth/refresh') {
      return Promise.reject(error);
    }

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    isRefreshing = true;

    try {
      const refreshToken = getRefreshToken();
      const { data } = await api.post('/auth/refresh', { refreshToken });

      // Save new tokens (refresh endpoint returns "accessToken", not "token")
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      setTokenExpiresAt(Date.now() + data.expiresIn * 1000);

      // Retry original request + queued requests
      processQueue(null, data.accessToken);
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      // Refresh failed — force re-login
      clearTokens();
      redirectToLogin();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
```

### 3. (Optional) Proactive Refresh

Instead of waiting for a 401, refresh the token proactively before it expires:

```typescript
// Call this periodically or before API calls
async function ensureFreshToken() {
  const expiresAt = getTokenExpiresAt();
  const bufferMs = 60 * 1000; // refresh 1 minute before expiry

  if (expiresAt && Date.now() > expiresAt - bufferMs) {
    const refreshToken = getRefreshToken();
    const { data } = await api.post('/auth/refresh', { refreshToken });
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setTokenExpiresAt(Date.now() + data.expiresIn * 1000);
  }
}
```

### 4. Update Logout

```typescript
async function logout() {
  try {
    const refreshToken = getRefreshToken();
    await api.post('/auth/logout', { refreshToken });
  } catch {
    // Best-effort; still clear local tokens
  }
  clearTokens();
  redirectToLogin();
}

async function logoutAllDevices() {
  await api.post('/auth/logout-all');
  clearTokens();
  redirectToLogin();
}
```

---

## Token Storage Recommendations

| Platform | Access Token | Refresh Token |
|---|---|---|
| **Web (React/Next.js)** | In-memory variable or `sessionStorage` | `localStorage` (or httpOnly cookie if you add a BFF layer) |
| **React Native / Expo** | In-memory | `expo-secure-store` or `react-native-keychain` |

**Never** store tokens in plain cookies accessible to JavaScript on web. The refresh token is the long-lived credential — treat it like a password.

---

## Security Properties

| Property | How it works |
|---|---|
| **Short-lived access** | 15-min JWT. If stolen, attacker has a very limited window. |
| **Token rotation** | Each refresh token is single-use. After use, a new one is issued. |
| **Reuse detection** | If a revoked refresh token is replayed (stolen-token attack), the entire session family is revoked. User must re-sign with wallet. |
| **Revocation** | `POST /auth/logout` revokes the session. `POST /auth/logout-all` nukes everything. |
| **No rawSig in JWT** | The wallet signature is no longer embedded in the JWT payload. |
| **TTL auto-cleanup** | Expired refresh tokens are automatically deleted by MongoDB TTL index. |
| **Online presence** | `Account.online` is set to `true` on login/refresh, `false` when all sessions are logged out. `lastSeenAt` is updated on every token refresh (~every 15 min while active). |

---

## Migration Checklist

- [ ] Store `refreshToken` from login response
- [ ] Store `expiresIn` / compute `expiresAt`
- [ ] Add 401 interceptor that calls `POST /auth/refresh`
- [ ] After successful refresh, update both stored tokens and retry the failed request
- [ ] Handle refresh failure (redirect to wallet sign-in)
- [ ] Update logout to call `POST /auth/logout` with the refresh token
- [ ] (Optional) Add proactive token refresh before expiry
- [ ] (Optional) Add "Logout from all devices" UI using `POST /auth/logout-all`
