

# Mobile Implementation Document: AI Assistant (`/app/assistant`)

This document covers every component, service, endpoint, data model, and logic flow needed to implement the DeHub AI Assistant on mobile.

---

## 1. Architecture Overview

```text
┌─────────────────────────────────────────────────────┐
│                   Mobile Client                      │
│                                                      │
│  AssistantScreen (UI)                                │
│    ├── Header (new chat, history, settings, style)   │
│    ├── Message List (scroll, auto-scroll)            │
│    ├── Quick Actions (chips: news, image, video)     │
│    ├── Input Bar (text, attach, voice, send)         │
│    └── Modals (settings, style, history, paywall)    │
│                                                      │
│  Hooks / Services                                    │
│    ├── useAIConversation (persistence)               │
│    ├── useAssistantUserContext (user stats)           │
│    ├── useVoiceChat (Web Speech API)                 │
│    ├── useMention (@user autocomplete)               │
│    └── AuthContext (wallet auth gate)                │
└───────────────┬──────────────────────────────────────┘
                │  supabase.functions.invoke(...)
                ▼
┌─────────────────────────────────────────────────────┐
│              Edge Functions (Backend)                 │
│                                                      │
│  general-ai-chat   → text chat, model routing        │
│  generate-image    → image gen (Gemini / Grok)       │
│  generate-video    → video gen (Replicate polling)   │
└─────────────────────────────────────────────────────┘
```

---

## 2. Authentication Gate

Access is restricted to authenticated users. Check `isAuthenticated` from `AuthContext`. If not authenticated, show a login prompt (equivalent to `<AuthGate />`). The user authenticates via Web3Auth (social login → Smart Account) or external wallet, producing a `walletAddress`.

---

## 3. Message Data Model

```typescript
interface Message {
  id: string;                    // timestamp-based unique ID
  role: 'user' | 'assistant';
  content: string;               // text content (rendered as markdown for assistant)
  imageUrl?: string;             // generated/edited image URL
  videoUrl?: string;             // generated video URL
  attachedImage?: string;        // base64 image user attached for editing
  isVideoGenerating?: boolean;   // true while video is being generated
  videoPredictionId?: string;    // Replicate prediction ID for polling
  isSimulation?: boolean;        // transaction simulation card
  simulationType?: 'transfer' | 'purchase';
  simulationData?: {
    txHash: string;
    amount: string;
    recipient?: string;
    token: string;
    timestamp: string;
  };
  simulationStatus?: 'pending' | 'approved' | 'rejected';
  isError?: boolean;             // error messages show a "Retry" button
}
```

---

## 4. State Management

All state is local to the assistant screen (no global store needed):

| State | Type | Purpose |
|---|---|---|
| `messages` | `Message[]` | Chat history |
| `input` | `string` | Current text input |
| `isLoading` | `boolean` | Text chat in progress |
| `isImageLoading` | `boolean` | Image generation in progress |
| `isVideoLoading` | `boolean` | Video generation in progress |
| `selectedStyle` | `string` | Personality style ID (default: `'normal'`) |
| `selectedChatModel` | `string` | Chat model ID (default: `'auto'`) |
| `selectedImageModel` | `ImageModelKey` | Image model (default: `'gemini-2.5-flash'`) |
| `selectedVideoModel` | `VideoModelKey` | Video model (default: `'kling-2.6-pro'`) |
| `selectedVoice` | `VoicePreferenceKey` | Voice preference (default: `'female'`) |
| `attachedImage` | `string \| null` | Base64 attached image for editing |
| `paywallOpen` | `boolean` | Video paywall modal visibility |
| `imagePaywallOpen` | `boolean` | Image paywall modal visibility |
| `historyDrawerOpen` | `boolean` | Conversation history drawer |
| `settingsSheetOpen` | `boolean` | Settings sheet |
| `styleSheetOpen` | `boolean` | Style selector sheet |

---

## 5. Core Logic Flows

### 5.1 Sending a Message (`handleSend`)

1. Create user `Message`, append to `messages`, save via `queueMessage()`
2. Classify the message:
   - **Logo request** (non-creative): Show logo image directly, return
   - **Video request** (`VIDEO_KEYWORDS` match): Open `VideoPaywallModal`, return
   - **Image request** (`IMAGE_KEYWORDS` match OR has `attachedImage`): Open `ImagePaywallModal`, return
   - **Text chat**: Call `general-ai-chat` edge function
3. For text chat: retry up to 2 times with 1s/2s backoff (skip retries for `RATE_LIMIT` / `CREDITS_EXHAUSTED`)
4. Append assistant response to messages, save via `queueMessage()`
5. If `alwaysSpeakReplies` is on, auto-speak the response

### 5.2 Request Classification Keywords

**Image generation triggers** (skip if video keywords also match):
`generate image, create image, draw, photo of, picture of, show me, visualize, render, depict` (and many more — see `IMAGE_KEYWORDS` array)

**Video generation triggers**:
`generate video, create video, animate, video of, bring to life, make it move, turn into` (see `VIDEO_KEYWORDS`)

**Logo detection** (`LOGO_KEYWORDS`):
`dehub logo, ftv logo, your logo, official logo, brand logo`

### 5.3 Image Generation Flow

1. User message triggers image detection → opens `ImagePaywallModal`
2. Modal shows cost in DHB (fetched live via `getDHBPrice` API), allows model selection
3. On confirm: executes DHB token transfer to treasury `0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c`
4. Calls `generate-image` edge function with `{ prompt, sourceImage?, conversationHistory, model }`
5. Returns `{ imageUrl }` or `{ error, safetyBlocked?, clearHistory? }`
6. Appends image message to chat

### 5.4 Video Generation Flow

1. User message triggers video detection → opens `VideoPaywallModal`
2. Same DHB payment flow as image
3. Calls `generate-video` edge function with `{ prompt, model, sourceImage?, duration, aspectRatio }`
4. Returns `{ predictionId }` — video is async
5. Start polling every 5 seconds: call `generate-video` with `{ predictionId }`
6. Poll returns `{ status: 'succeeded' | 'failed' | 'processing', videoUrl? }`
7. On success: update message with `videoUrl`, stop polling
8. On fail: update message with error, stop polling

### 5.5 Transaction Simulation

When user says "send 100 DHB to @bailey" etc.:
- Edge function parses the request and returns `{ isSimulation: true, simulationData, simulationType }`
- UI shows a card with Approve/Reject buttons
- Approve: updates status to `'approved'`, shows tx hash
- Reject: updates status to `'rejected'`
- Optional: PIN setup modal, auto-approve mode

---

## 6. Edge Functions (Backend)

### 6.1 `general-ai-chat`

**Endpoint**: `supabase.functions.invoke('general-ai-chat', { body })`

**Request body**:
```typescript
{
  messages: { role: 'user' | 'assistant', content: string }[],
  style: string,          // personality ID
  model: string,          // 'auto' | 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gpt-5-mini' | 'grok-4'
  isAuthenticated: boolean,
  userLanguage: string,   // e.g. 'en', 'tr'
  userContext: AssistantUserContext,  // user stats
  dehubToken?: string,    // DeHub API auth token for post analysis
  postContext?: PostContext, // when opened from a post card
}
```

**Smart model routing (auto mode)**:
- Personal questions → `gemini-2.5-flash` (free)
- DeHub questions → `gemini-2.5-flash` (free)
- Live search/news → Perplexity `sonar` (premium, if API key configured)
- Complex reasoning → `gemini-2.5-pro` (standard)
- Post/user analysis → `gemini-2.5-pro` (standard)
- Default → `gemini-2.5-flash` (free)

**Enrichments injected into system prompt**:
- Platform context (leaderboard top 10, governance proposals, feature requests)
- User memories (persistent facts extracted from past conversations, stored in `ai_user_memories`)
- User profile stats (followers, balance, tips, snapshots for delta calculations)
- Post analysis data (fetched from DeHub API `/api/feed?minter=...`)
- Other user lookup (fetched from DeHub API `/api/account_info/...`)
- Post context (when opened from a feed card — caption, author, image for vision)

**Memory extraction**: After meaningful conversations (2+ user messages), the function uses `gemini-2.5-flash-lite` to extract 0-3 personal facts and upserts them into `ai_user_memories`.

**Response**: `{ response: string, fallbackUsed?: boolean, isSimulation?: boolean, simulationData?, searchUsed?, modelUsed?, modelTier? }`

### 6.2 `generate-image`

**Request**: `{ prompt, sourceImage?, conversationHistory?, model? }`

**Models**: `gemini-2.5-flash` (default), `gemini-3-pro-image`, `grok-2-image` (xAI Aurora)

- Gemini models: Lovable AI Gateway with `responseModalities: ['TEXT', 'IMAGE']`
- Grok Aurora: xAI API `grok-2-image` (text-to-image only, no editing)
- Source image = editing mode (only Gemini supports this)

**Response**: `{ imageUrl: string }` (base64 data URL) or `{ error, safetyBlocked?, clearHistory? }`

### 6.3 `generate-video`

**Request**: `{ prompt, model, sourceImage?, duration?, aspectRatio? }` or `{ predictionId }` (for polling)

**Models** (all via Replicate API):
| Key | Model | Supports |
|---|---|---|
| `kling-2.6-pro` | Kling 2.6 | text+image → video, has audio |
| `luma-ray2` | Luma Ray 2 | text → video |
| `runway-gen4` | Runway Gen-4 Turbo | image → video only |
| `minimax-video` | Minimax Video-01 | text+image → video |
| `ltx-video` | LTX Video | text+image → video |

**Response** (create): `{ predictionId, status: 'starting' }`
**Response** (poll): `{ status: 'succeeded' | 'failed' | 'processing', videoUrl? }`

---

## 7. Conversation Persistence

### Database Tables

**`ai_conversations`**: `{ id, wallet_address, title, created_at, updated_at }`
**`ai_messages`**: `{ id, conversation_id, role, content, image_url, video_url, attached_image, created_at }`
**`ai_user_memories`**: `{ wallet_address, content, memory_type, importance, updated_at }` (unique on `wallet_address,content`)

### `useAIConversation` Hook

- `createConversation(firstMessage)` — creates row in `ai_conversations`, sets title from first 50 chars
- `saveMessage(message, conversationId)` — inserts into `ai_messages`, updates `updated_at`
- `queueMessage(message)` — auto-creates conversation if needed, then saves
- `startNewConversation()` — resets state
- `loadConversation(id)` — sets conversation ID for loading

### `ConversationHistoryDrawer`

- Lists past conversations ordered by `updated_at DESC` (limit 50)
- Media carousel at top: aggregates all `image_url` and `video_url` from user's messages
- Load conversation: fetches all messages for a conversation and restores them
- Delete single / clear all conversations
- RLS: all queries filtered by `wallet_address` via `withWalletHeader()`

---

## 8. User Context (`useAssistantUserContext`)

Aggregates from multiple sources:
- **DeHub API** (`getAccountInfo`): username, displayName, followers, following, posts, likes, badges, staked
- **Tip leaderboard cache** (database): sent/received tip totals
- **Leaderboard cache** (database): rank and total DHB balance
- **Leaderboard snapshots** (database): last 30 daily snapshots for historical delta queries

Returns `AssistantUserContext | null`, refreshed every 5 minutes.

---

## 9. Constants / Configuration

### Chat Models (`chat-models.constants.ts`)
| ID | Name | Description |
|---|---|---|
| `auto` | Auto | Smart routing |
| `gemini-2.5-flash` | Gemini Flash | Fast & free |
| `gemini-2.5-pro` | Gemini Pro | Best reasoning $$ |
| `gpt-5-mini` | GPT-5 Mini | OpenAI $ |
| `grok-4` | Grok 4 | xAI flagship $$$ |

### AI Styles (`ai-styles.constants.ts`)
42 personality options including Normal (default), family roles (Daddy, Mommy, Big Brother, etc.), regional accents (Cockney, Celtic, Wild West, etc.), character types (Pirate, Alien, E-Girl, Chad), and political personas (Conservative, Liberal, etc.).

### Image Models (`image-models.constants.ts`)
| ID | Name | Base Cost USD |
|---|---|---|
| `gemini-2.5-flash` | Gemini 2.5 Flash | $0.02 |
| `gemini-3-pro-image` | Gemini 3 Pro | $0.08 |
| `grok-2-image` | Grok Aurora | $0.06 |

100% markup applied. Cost in DHB = `costUsd * 2 / dhbPriceUsd`.

### Video Models (`video-models.constants.ts`)
| ID | Name | Base Cost USD | Supports |
|---|---|---|---|
| `kling-2.6-pro` | Kling 2.6 Pro | $1.10 | text+image, audio |
| `luma-ray2` | Luma Ray 2 | $0.65 | text only |
| `runway-gen4` | Runway Gen-4 | $0.50 | image only |
| `minimax-video` | Minimax | $0.22 | text+image |
| `ltx-video` | LTX Video | $0.085 | text+image |

### Voice Preferences (`voice-models.constants.ts`)
`female` (Samantha/Zira), `male` (Alex/Daniel), `neutral` (system default). Uses browser Web Speech API — no external API needed.

---

## 10. Paywall / Payment Flow

Both `ImagePaywallModal` and `VideoPaywallModal`:
1. Fetch live DHB price from `supabase.functions.invoke('get-dhb-price')`
2. Calculate cost: `baseCostUsd * 2 / dhbPriceUsd` → display in DHB
3. User can switch models within the modal
4. On "Generate": execute `ERC20.transfer(TREASURY, amount)` via `writeContractAA()`
5. Treasury address: `0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c`
6. Supports chain switching (Base / BNB) and balance checking
7. On success: call the corresponding generation edge function

---

## 11. Voice Chat (`useVoiceChat`)

Uses browser-native Web Speech API (free, no API key):
- **Speech Recognition**: `webkitSpeechRecognition` / `SpeechRecognition`
- **Text-to-Speech**: `speechSynthesis.speak()` with voice preference matching
- When user finishes speaking, `onTranscript` callback auto-sends the message
- `voiceAutoReply`: auto-speaks assistant response after voice input
- `alwaysSpeakReplies`: speaks ALL responses regardless of input method

---

## 12. @Mentions (`useMention`)

- Triggers on `@` character in input
- Searches DeHub users via API
- Dropdown appears above input with matching users
- Selecting a user inserts `@username` into the input text
- The `@username` is sent to the edge function which can look up that user's profile and posts

---

## 13. UI Components to Implement

| Component | Purpose |
|---|---|
| **Header Bar** | Logo/title (tap = new chat), Command Centre toggle, History button, Settings button, Style selector |
| **Message Bubble (user)** | Right-aligned, glass-morphism bubble, shows attached image if any |
| **Message Bubble (assistant)** | Left-aligned, no bubble, avatar, markdown-rendered text |
| **Image Message** | Full image with action buttons: Attach (for editing), Copy, Post |
| **Video Message** | Video player with Download and Post buttons |
| **Video Generating** | Animated gradient placeholder with progress bar |
| **Image Generating** | `ImageGenerationLoader`: spinner → growing skeleton with color waves |
| **Simulation Card** | Transfer/purchase details with Approve/Reject buttons, PIN setup |
| **Quick Action Chips** | Horizontally scrollable: "What's New", "Generate Image", "Edit Image", "Generate Video" |
| **Input Bar** | Auto-expanding textarea, attach button, voice button, send button |
| **Settings Drawer** | Sections: Chat Model, Image Model, Video Model, Voice, toggles (auto-reply, always speak) |
| **Style Drawer** | Grid of 42 personality options |
| **History Drawer** | Media carousel + conversation list with delete/clear |
| **Image Paywall Modal** | Model selector, cost display, Generate button, chain selector |
| **Video Paywall Modal** | Same as image but for video models |
| **PIN Modal** | 4-6 digit numeric PIN for transaction approval |

---

## 14. Rendering Rules

- All assistant text MUST be rendered through a markdown renderer (bold, italic, lists, links)
- User messages are plain text in a bubble
- Image-only responses show no text bubble (empty content)
- Error messages include a "Retry" button that re-sends the last user message
- Welcome message shown on mount (no avatar for initial message)
- Auto-scroll to bottom on new messages (skip for initial welcome)
- Quick action chips remain visible after every response

---

## 15. PostContext (Post Card AI Chat)

When opened from a feed card (via `PostAIChat` component), inject `postContext`:
```typescript
interface PostContext {
  type: 'image' | 'video' | 'live' | 'post';
  author?: string;
  caption?: string;
  title?: string;
  game?: string;
  viewers?: string;
  thumbnail?: string;
  imageUrl?: string;        // for vision analysis
  imageUrls?: string[];     // multi-image posts
  activeImageIndex?: number; // which image user is viewing
}
```

The edge function includes the image in the API call for vision analysis (Gemini multimodal). For video/live types, the AI cannot watch video but can discuss metadata.

---

## 16. Error Handling

| Error Code | User Message | Action |
|---|---|---|
| `RATE_LIMIT` | "Too many requests, try again shortly" | No retry |
| `CREDITS_EXHAUSTED` | "AI credits exhausted" | No retry |
| `TIMEOUT` | "Request timed out" | Auto-retry up to 2x |
| `UPSTREAM_ERROR` | "AI service error" | Auto-retry up to 2x |
| Default | Show error message | Auto-retry up to 2x |

All errors logged to `client_error_logs` table for diagnostics.

