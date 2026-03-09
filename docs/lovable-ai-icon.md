Let me explore the AI system and icon usage across the codebase.

Now let me search for all icon usage across the codebase:

Now let me get a complete list of all lucide icons used:

Now let me check the client-side chat components and the conversation persistence tables:

Now let me check the request body shape from the client side for the main chat:

I now have all the information needed. This is a research/documentation question, not an implementation task, so I'll provide the documentation directly without a plan.

Here's the full documentation for implementing the DeHub AI system in a mobile app, plus the complete icon inventory.

---

## DeHub AI System -- Mobile Implementation Guide

### 1. Architecture Overview

The AI system consists of **3 backend functions** (edge functions) that the mobile app calls via HTTP POST:

```text
┌─────────────────┐
│   Mobile App    │
└───────┬─────────┘
        │ HTTPS POST
        ▼
┌───────────────────────────────────────────┐
│  Edge Functions (Deno / Supabase)         │
│                                           │
│  1. general-ai-chat   (text chat)         │
│  2. generate-image    (image generation)  │
│  3. generate-video    (video generation)  │
└───────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────┐
│  AI Providers                             │
│  - Lovable AI Gateway (Gemini/GPT)        │
│  - Perplexity (live web search)           │
│  - xAI Grok (text + image gen)            │
│  - Replicate (video gen)                  │
└───────────────────────────────────────────┘
```

---

### 2. Endpoints

**Base URL:** `https://aigxuutjaqsywioxjefr.supabase.co/functions/v1`

All endpoints accept `POST` with `Content-Type: application/json`. No JWT required (verify_jwt = false).

---

### 2A. `POST /general-ai-chat` -- Text Chat

**Request Body:**
```json
{
  "messages": [
    { "role": "user", "content": "What is DHB staking APY?" },
    { "role": "assistant", "content": "The current staking APY..." },
    { "role": "user", "content": "How about 90 days?" }
  ],
  "style": "normal",
  "model": "auto",
  "isAuthenticated": true,
  "userLanguage": "en",
  "postContext": {
    "type": "image | video | live | post",
    "author": "username",
    "caption": "post caption text",
    "title": "post title",
    "game": "Fortnite",
    "viewers": "1.2k",
    "thumbnail": "https://...",
    "imageUrl": "https://..."
  },
  "userContext": {
    "username": "malik",
    "displayName": "Malik Jan",
    "walletAddress": "0xABC...123",
    "followers": 5000,
    "following": 200,
    "postsCount": 150,
    "likesReceived": 12000,
    "badgeBalance": 50000,
    "tipsReceived": 1200,
    "tipsSent": 300,
    "staked": 100000,
    "leaderboardRank": 42,
    "leaderboardBalance": 500000,
    "snapshots": [
      {
        "balance": 500000,
        "followers": 5000,
        "likes": 12000,
        "subscribers": 100,
        "sent_tips": 300,
        "received_tips": 1200,
        "snapshot_date": "2026-03-08"
      }
    ]
  },
  "dehubToken": "Bearer eyJ..."
}
```

**Field Details:**

| Field | Required | Description |
|-------|----------|-------------|
| `messages` | Yes | Full conversation history array `{role, content}` |
| `style` | No | Personality style. Default `"normal"`. Options: `normal`, `daddy`, `mommy`, `big-brother`, `lil-bro`, `big-sister`, `little-sister`, `old-english`, `cockney`, `celtic`, `scouse`, `wild-west`, `asian-uncle`, `russian-mafia`, `pirate`, `alien`, `e-girl`, `chad`, `hopeless-romantic`, `conservative`, `liberal`, `antifa`, `capitalist`, `socialist`, `neocon`, `feminist`, `progressive`, `nationalist`, `communist` |
| `model` | No | Default `"auto"`. Options: `auto`, `gemini-2.5-flash`, `gemini-2.5-pro`, `gpt-5-mini`, `grok-4` |
| `isAuthenticated` | No | Whether user is logged in |
| `userLanguage` | No | ISO language code (e.g. `"en"`, `"tr"`, `"ar"`) |
| `postContext` | No | Context of the post being discussed (for post-specific AI chat) |
| `userContext` | No | Current user's profile stats for personal questions |
| `dehubToken` | No | DeHub API auth token for fetching user posts |

**Response (200):**
```json
{
  "response": "The current staking APY for 90 days is 18.7%...",
  "searchUsed": false,
  "fallbackUsed": false,
  "modelUsed": "google/gemini-2.5-flash",
  "modelTier": "free",
  "modelReason": "Standard query"
}
```

**Error Responses:**
| Status | errorCode | Meaning |
|--------|-----------|---------|
| 429 | `RATE_LIMIT` | Too many requests, wait and retry |
| 402 | `CREDITS_EXHAUSTED` | AI credits used up |
| 503 | `UPSTREAM_ERROR` | AI provider error |
| 504 | `TIMEOUT` | Request timed out (45s limit) |
| 500 | `INTERNAL_ERROR` | Server error |

**Smart Model Routing (auto mode):**
The backend automatically selects the best model:
- Personal questions ("my followers") → Gemini Flash (free)
- DeHub knowledge → Gemini Flash (free)
- Post/profile analysis → Gemini Pro (standard)
- Complex reasoning → Gemini Pro (standard)
- Live web search → Perplexity (premium)
- Default → Gemini Flash (free)

---

### 2B. `POST /generate-image` -- Image Generation

**Request Body:**
```json
{
  "prompt": "A futuristic city at sunset",
  "sourceImage": "data:image/png;base64,...",
  "conversationHistory": [
    { "role": "user", "content": "Make a landscape" },
    { "role": "assistant", "content": "Here's your landscape" }
  ],
  "model": "gemini-2.5-flash"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `prompt` | Yes | Image description |
| `sourceImage` | No | Base64 image for editing (not generation) |
| `conversationHistory` | No | Previous messages for context |
| `model` | No | Default `"gemini-2.5-flash"`. Options: `gemini-2.5-flash`, `gemini-3-pro-image`, `grok-aurora`, `gpt-5` |

**Response (200):**
```json
{
  "imageUrl": "data:image/png;base64,...",
  "text": "Here's your futuristic city",
  "success": true
}
```

**Error (400 - Safety):**
```json
{
  "error": "DeHub is a family friendly platform...",
  "safetyBlocked": true,
  "clearHistory": true
}
```

**Routing Logic:**
- Grok Aurora: text-to-image only (no editing), uses xAI API
- Gemini: text-to-image AND image editing, uses Lovable AI Gateway
- If Grok selected with sourceImage → auto-fallback to Gemini

---

### 2C. `POST /generate-video` -- Video Generation

**Request Body:**
```json
{
  "prompt": "A cat walking on a rainbow bridge",
  "model": "kling-2.6-pro",
  "sourceImage": "https://...",
  "duration": "5s",
  "aspectRatio": "16:9"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `prompt` | Yes | Video description |
| `model` | Yes | One of: `kling-2.6-pro`, `luma-ray2`, `minimax-video`, `runway-gen4`, `ltx-video` |
| `sourceImage` | No | URL for image-to-video |
| `duration` | No | `"5s"` or `"10s"` |
| `aspectRatio` | No | `"16:9"`, `"9:16"`, or `"1:1"` |

**Status Check (polling):**
```json
{ "predictionId": "abc123" }
```

**Response:**
```json
{
  "status": "starting | processing | succeeded | failed",
  "predictionId": "abc123",
  "videoUrl": "https://replicate.delivery/..."
}
```

**Video Models:**
| Model | Supports | Notes |
|-------|----------|-------|
| `kling-2.6-pro` | text-to-video, image-to-video | Best quality, native audio, 5s/10s |
| `luma-ray2` | text-to-video only | Photorealistic 720p, 5s |
| `minimax-video` | text-to-video, image-to-video | Fast, 6s |
| `runway-gen4` | **image-to-video ONLY** | Stunning quality, 10s |
| `ltx-video` | text-to-video, image-to-video | Fast/efficient, 5s |

**Polling Pattern:**
1. Send generation request → get `predictionId`
2. Poll every 3-5 seconds with `{ "predictionId": "..." }`
3. Continue until `status === "succeeded"` or `"failed"`

---

### 3. Conversation Persistence (Database)

**Tables:**

**`ai_conversations`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| wallet_address | text | User's wallet (lowercase) |
| title | text | First message truncated to 50 chars |
| created_at | timestamp | Auto |
| updated_at | timestamp | Updated on each message |

**`ai_messages`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| conversation_id | uuid (FK) | Links to ai_conversations |
| role | text | `"user"` or `"assistant"` |
| content | text | Message text |
| image_url | text | Generated image URL |
| video_url | text | Generated video URL |
| attached_image | text | User-attached image |
| created_at | timestamp | Auto |

**`ai_user_memories`**
| Column | Type | Description |
|--------|------|-------------|
| wallet_address | text | User's wallet (lowercase) |
| content | text | Extracted fact (max 500 chars) |
| memory_type | text | `preference`, `interest`, `fact`, or `goal` |
| importance | int | Priority (default 5) |
| updated_at | timestamp | Last updated |

Memories are auto-extracted server-side after 3+ messages using Gemini Flash Lite. The mobile app does NOT need to handle memory extraction.

---

### 4. Mobile Implementation Steps

1. **Build the chat UI** - message bubbles (user right-aligned, AI left-aligned), text input, send button
2. **Maintain message history in-memory** as an array of `{role, content}` objects
3. **Send full history** with each request to `/general-ai-chat`
4. **Render AI responses with markdown** support (bold, links, line breaks)
5. **Handle errors** - show toast for 429/402/503, retry on timeout
6. **Implement post context** - when opening AI from a post thumbnail, pass `postContext`
7. **Pass userContext** - fetch user profile data and include with requests
8. **Implement image generation** - detect image requests client-side OR let user toggle, call `/generate-image`
9. **Implement video generation** - call `/generate-video`, then poll for completion
10. **Persist conversations** - save to `ai_conversations` / `ai_messages` tables via Supabase client
11. **Load conversation history** - query tables on app launch for returning users
12. **Implement personality selector** - pass `style` parameter
13. **Implement model selector** - pass `model` parameter

---

### 5. Client-Side Image Request Detection

The web app detects image requests with keyword matching. Replicate this pattern:

```
Keywords: "generate", "create", "make", "draw", "design", "paint",
"sketch", "render", "show me", "picture of", "image of", "photo of"
+ ("image", "picture", "photo", "drawing", "illustration", "art",
   "artwork", "graphic", "portrait", "logo", "icon", "wallpaper")
```

Similarly for video: check for "video", "animation", "clip", "footage" combined with generation verbs.

---

## Complete Icon Inventory

### Lucide React Icons (library: `lucide-react`)

Used across 172+ files. Here is every unique icon imported:

**Navigation & Layout:**
`Menu`, `X`, `ChevronLeft`, `ChevronRight`, `ChevronDown`, `ChevronUp`, `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `ArrowUpRight`, `ArrowDownLeft`, `ArrowDownToLine`, `ArrowUpFromLine`, `LayoutDashboard`, `Columns`, `Maximize2`, `Minimize2`, `PanelLeftClose`, `MoreVertical`, `MoreHorizontal`, `ExternalLink`, `Home`

**Communication:**
`MessageCircle`, `MessageSquare`, `MessageSquarePlus`, `Send`, `Mail`, `Bell`, `Phone`, `PhoneCall`, `PhoneOff`, `Mic`, `MicOff`, `Volume2`, `VolumeX`, `Languages`

**Media:**
`Image`, `Camera`, `Film`, `Video`, `Play`, `Pause`, `Square`, `SkipBack`, `SkipForward`, `Shuffle`, `Repeat`, `Radio`, `Tv`, `Music`, `ListMusic`, `Upload`, `Download`, `Paperclip`

**User & Social:**
`User`, `UserPlus`, `UserMinus`, `Users`, `Heart`, `ThumbsUp`, `ThumbsDown`, `Share2`, `Bookmark`, `Eye`, `EyeOff`, `Star`, `Trophy`, `Crown`, `Gem`, `Flag`

**Actions & Status:**
`Search`, `SlidersHorizontal`, `Settings`, `Pencil`, `Trash2`, `Copy`, `Check`, `CheckCircle`, `CheckCircle2`, `Plus`, `Minus`, `RefreshCw`, `RotateCcw`, `Loader2`, `AlertCircle`, `AlertTriangle`, `Info`, `HelpCircle`, `Ban`, `ShieldBan`, `ShieldCheck`

**Content & Data:**
`Type`, `SpellCheck`, `Palette`, `Paintbrush`, `Crop`, `Scissors`, `Tag`, `Save`, `Clock`, `Calendar`, `TrendingUp`, `DollarSign`, `Activity`, `Wallet`, `QrCode`, `Link`, `Pin`, `Repeat2`, `Bot`, `Sparkles`, `Wand2`, `Zap`

**Finance:**
`Coins`, `ShoppingCart`, `ArrowDownUp`, `Ticket`, `Gift`, `Lock`, `Briefcase`, `Handshake`, `Vote`

**Misc:**
`Signal`, `Wifi`, `BatteryFull`, `Sun`, `Moon`, `Globe`, `AtSign`, `Hash`, `Headphones`, `Lightbulb`

### Custom PNG Icons (directory: `src/assets/icons/`)

| File | Usage |
|------|-------|
| `ai-sparkle-icon.png` | Assistant page header |
| `ai-star-icon.png` | AI star button on post thumbnails |
| `audio-3d-icon.png` | Audio tab empty state |
| `base-logo.png` | Base chain selector |
| `bnb-logo.png` | BNB chain selector |
| `bookmark-3d-icon.png` | Bookmarks page empty state |
| `bookmark-icon.png` | Bookmarks page header |
| `chat-bubble.png` | Messages page |
| `comment-3d-icon.png` | Comments empty state |
| `filmstrip-3d-icon.png` | Video tab empty state |
| `fractions-3d-icon.png` | Fractions tab empty state |
| `home-3d-icon.png` | Home tab empty state |
| `image-frame-3d-icon.png` | Image tab empty state |
| `live-3d-icon.png` | Live tab empty state |
| `messages-3d-icon.png` | Messages page |
| `messages-bubble-icon.png` | Messages header |
| `messages-icon.png` | Messages navigation |
| `nail-icon.png` | Media editing (inpaint tool) |
| `notifications-icon.png` | Notifications page header |
| `search-3d-icon.png` | Explore empty state |
| `search-icon.png` | Explore page header |
| `settings-icon.png` | Settings page header |
| `stages-mic-icon.png` | Audio Spaces / Stages |
| `star-3d-icon.png` | Favorites empty state |
| `subs-3d-icon.png` | Subscriptions empty state |
| `translate-globe-icon.png` | Translation feature |
| `trending-fire-icon.png` | Trending section |

### Other Custom Assets (`src/assets/`)

| File | Usage |
|------|-------|
| `ai-assistant-avatar.png` | AI chat avatar |
| `dehub-coin.png` | DHB token icon (tips, staking) |
| `dehub-logo.png` + variants | App branding |
| `bnb-logo.png` | BNB currency |
| `eth-logo.png` | ETH currency |
| `usdt-logo.png` | USDT currency |
| `btc-logo.png` | BTC currency |
| `usdc-logo.png` | USDC currency |
| `lock-3d.png` | Locked content |
| `padlock.png` | Tip-to-message lock |
| `medal-1.png` through `medal-10.png` | Leaderboard ranks 1-10 |
| `governance-shield.png` | Governance page |
| `features-lightbulb.png` | Feature requests page |
| `ppv-ticket-icon.png` | Pay-per-view |
| `tip-icon.png` | Tipping |
| `trophy-icon.png` | Trophy/ranking |
| `glossary-icon.png` | Glossary page |
| `ftv-logo-symbol.png` | Futurov legacy branding |
| `google-play-badge.png` | App store link |
| `app-store-badge.svg` | App store link |
| `x-logo.png`, `instagram-logo.png`, `telegram-logo.png`, `tiktok-logo.png` | Social links |

### Staking Badge Assets (`src/assets/badges/`)

13 tier badges: `Tortoise`, `Crab`, `Piranha`, `Lobster`, `Octopus`, `Cobra`, `Crocodite`, `Dolphin`, `Tiger Shark`, `Great White Shark`, `Killer Whale`, `Blue Whale`, `Meglodon`

Export documentation as file
Explore personality selector UI
Deep dive into chat persistence