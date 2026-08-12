# AI Assistant (mobile)

How `screens/AIChatScreen.tsx` works, and where it has to agree with
dehubweb's `/app/assistant`. This replaces the pre-build spec that used to live
here: several things in it (the client-side DHB transfer, the 100% markup, the
`grok-aurora` model id, browser Web Speech voice) describe a version of the
feature that no longer exists on either app.

---

## 1. Architecture

```text
┌──────────────────────────────────────────────────────────┐
│ AIChatScreen                                             │
│   AssistantHeader      new chat · history · settings · 🤖 │
│   AssistantBubble[]    markdown, media, retry             │
│   QuickActionChips     7 actions, same as web             │
│   AssistantInputBar    auto-growing, @mentions, attach    │
│   Sheets  history · settings · style · poster · music     │
│           CreditPaywallSheet ×3 (image / video / tool)    │
├──────────────────────────────────────────────────────────┤
│ services/ai.service.ts                                   │
│   streamAIChat (SSE over XHR) · generate* · fal tools     │
│   ai-credits (quote / balance / topup) · classification   │
│ hooks/useAiCredits.ts        balance, quote, pay-as-you-go │
│ hooks/useAIConversation.ts   AsyncStorage + Supabase mirror│
└───────────────┬──────────────────────────────────────────┘
                ▼
    general-ai-chat · generate-image · generate-video
    fal-ai-tools · ai-credits · generate-lyrics
```

The brain is the edge function, not this app — see the DeHub assistant
architecture notes. Adding a tool is a backend change and goes live here with no
release.

---

## 2. Paying for a generation

**Everything paid runs through the credit ledger.** `generate-image`,
`generate-video` and `fal-ai-tools` all sit behind
`_shared/ai-credit-guard.ts`, which:

1. requires a DeHub token in `x-dehub-token` — no header, 401;
2. prices the job itself from `_shared/ai-pricing.ts`;
3. debits the wallet's credit balance *before* calling the provider;
4. refunds if the provider then fails.

So the client's job is only to quote (`ai-credits` `action: 'quote'`), show the
balance, and top up the shortfall when there isn't enough. `usePayAsYouGo`
transfers exactly the shortfall to the AI treasury
(`0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c`) and claims it as credit; the
generation then debits it.

Things that are easy to get wrong here:

- **Costs in `config/ai-models.constants.ts` are display only.** The server
  quote is the charge. The two are kept in step by hand.
- **The top-up claim only sees Base and BNB.** A transfer on any other chain
  cannot be credited, which is why `usePayAsYouGo` refuses instead of signing.
- **A claim is valid for an hour.** `ai-credits` rejects older transfers,
  because the AI treasury is the same address ads, PPV and the old
  pay-per-image flow all paid into.
- **`sourceImage` and `logoImage` must be `data:image/…;base64,…` URLs.**
  `generate-image` hands them straight to the provider and only accepts a logo
  that `startsWith('data:image/')`. Use `toImageDataUrl` /
  `bundledLogoDataUrl` from `libs/assistantMedia.ts`, never a raw base64 body.

---

## 3. What a prompt does

`routePrompt` classifies in this order, and the order matters — half the video
phrases also match an image keyword:

| # | Test | Goes to |
|---|---|---|
| 1 | `requiresLogoAsset` and not `isCreativeLogoRequest` | shows the bundled wordmark, free |
| 2 | `detectAiToolRequest` | music sheet, or the tool paywall |
| 3 | `isVideoRequest` | video paywall |
| 4 | `isImageRequest` — `isDeHubBrandedImageRequest` first | poster studio, then image paywall |
| 5 | anything else | `streamAIChat` |

The phrase lists live in `services/ai.service.ts` and are dehubweb's verbatim.
`__tests__/services/ai.classification.test.ts` pins them: a sentence that
classifies differently from web means the same prompt costs money on one app and
not the other.

---

## 4. Streaming

`streamAIChat` is XHR, not `fetch`. React Native's fetch is a whatwg-fetch shim
over XHR and never populates `response.body`, so web's `getReader()` loop cannot
be ported — it would deliver the whole answer at once. `onprogress` exposes the
growing `responseText`, and SSE frames are parsed out of it.

`__tool` frames name what the agent is doing (`describeTools`) so a lookup shows
"Checking your wallet…" rather than a bare spinner. An unknown tool key falls
back to its own name, which is what lets a backend-only tool read sensibly.

`isLoading` stays true for the whole stream on purpose: it is what stops a
second prompt being sent into a half-finished answer. The spinner hides itself
once `streamingContent` is non-null.

---

## 5. Long jobs

Video renders take 1–3 minutes and async fal tools about a minute, so both:

- write a placeholder turn carrying a stable `id`;
- persist `{ predictionId | requestId, messageId, … }` to AsyncStorage;
- poll every 5s, patching **by id** — by the time a render lands the user may
  have had another exchange, so position is not a safe handle;
- resume on next launch, re-injecting the placeholder via `appendLocalMessage`
  (deliberately unsaved: a "generating…" stub is not worth a conversation, and
  the finished result is what gets persisted).

`pollVideoGeneration` must be handed back `provider` and `falAppId` from the
start call — `generate-video` routes across Replicate, fal and kie and cannot
otherwise tell which holds the prediction.

---

## 6. History

Two tiers. AsyncStorage is the primary read (instant, offline, and where every
existing conversation already lives). `ai_conversations` / `ai_messages` are
mirrored so a thread started on the desktop shows up here and vice versa — that
was the gap, both apps kept separate lists for one account.

Every remote call fails soft; a signed-out or offline user gets the old local
behaviour. `data:` media is uploaded to the public `ai-media-uploads` bucket and
the row stores the https URL, because putting a multi-megabyte data URL in the
row breaks web's history view too. RLS on both tables reads the
`x-wallet-address` header, so all queries go through `withWalletHeader`.

The Media tab reads the server, so it lists desktop-generated images too.

---

## 7. Deliberately not ported

Named so nobody has to re-derive whether they were missed:

- **Voice mode** (Whisper STT → chat → Dia TTS, and the ElevenLabs voice
  picker/cloning). Web drives it with `MediaRecorder` plus an `AnalyserNode` for
  silence detection; neither exists here, so the interaction has to be
  redesigned (push-to-talk) rather than ported. The settings sheet keeps the
  voice preference and the always-speak toggle so the choice survives.
- **Skills and Characters** (`/slash` commands, the skills hub, `@character`
  personas). These are DB-backed with their own authoring UI on web.
- **The video composer's advanced options** — duration, resolution, negative
  prompt, reference and end frames, seed. Every render here asks for a 5s 16:9
  clip (`VIDEO_DURATION_SECONDS`), and that number has to stay the same in the
  request, the quote and the per-second row prices or the paywall shows one
  figure and the server charges another.
- **Transaction simulation cards** and the transfer PIN.
- **Builder**: web's chip opens `/app/builder`, which has no screen here yet, so
  the chip seeds the composer instead of dead-ending.
