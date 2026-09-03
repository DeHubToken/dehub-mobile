import env from '../config/env';
import { createLogger } from '../libs/logger';
import { getAuthToken } from '../libs/auth.utils';
import { requiresImageGeneration, requiresVideoGeneration } from './ai-intent';

const log = createLogger('ai.service');

const EDGE_BASE = env.SUPABASE_EDGE_BASE_URL;

/**
 * Headers the paid AI functions authenticate against.
 *
 * `generate-image`, `generate-video` and `fal-ai-tools` all run
 * through `_shared/ai-payment-guard.ts`, which requires a DeHub token in
 * `x-dehub-token` and answers 401 without one. Until this existed, mobile paid
 * DHB to the treasury from the paywall sheet and then got a 401 from the
 * generation itself — the money went and nothing came back.
 *
 * The wallet header is only a cross-check; the server takes the address off the
 * verified token, so a mismatch is a 403 rather than a silent substitution.
 */
export async function dehubAuthHeaders(
  walletAddress?: string | null,
): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (!token) return {};
  const headers: Record<string, string> = { 'x-dehub-token': token };
  if (walletAddress) headers['x-wallet-address'] = walletAddress.toLowerCase();
  return headers;
}

export interface AIChatMessage {
  /**
   * Stable id for turns that get patched in place later — a video render or an
   * async fal.ai tool finishing. Web keys every message; here it is optional so
   * conversations saved before this existed still load.
   */
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  /** Base64 or file URI of an image the user attached to this turn. */
  attachedImage?: string;
  /** True while a video is still rendering; `videoPredictionId` polls it. */
  isVideoGenerating?: boolean;
  videoPredictionId?: string;
  videoProvider?: string;
  videoFalAppId?: string;
  /** True while an async fal.ai tool is still running. */
  isToolProcessing?: boolean;
  toolRequestId?: string;
  toolAppId?: string;
  toolType?: string;
  /** Set on a failed turn so the bubble can offer a retry. */
  isError?: boolean;
}

export interface AIPostContext {
  type?: 'image' | 'video' | 'live' | 'post';
  author?: string;
  authorUsername?: string;
  caption?: string;
  title?: string;
  game?: string;
  viewers?: string;
  thumbnail?: string;
  imageUrl?: string;
  categories?: string[];
  views?: number;
  likes?: number;
  dislikes?: number;
  comments?: number;
  tips?: number;
  reposts?: number;
  duration?: string;
  createdAt?: string;
  isPayPerView?: boolean;
  ppvAmount?: number;
  ppvCurrency?: string;
  isLockContent?: boolean;
  lockAmount?: number;
  lockCurrency?: string;
  isBounty?: boolean;
  bountyAmount?: number;
  bountyCurrency?: string;
  isLive?: boolean;
  imageCount?: number;
}

export interface AIUserContext {
  username?: string;
  displayName?: string;
  walletAddress?: string;
  followers?: number;
  following?: number;
  postsCount?: number;
  likesReceived?: number;
  badgeBalance?: number;
  tipsReceived?: number;
  tipsSent?: number;
  staked?: number;
  leaderboardRank?: number;
  leaderboardBalance?: number;
}

export type AIStyle =
  | 'normal'
  | 'daddy'
  | 'mommy'
  | 'big-brother'
  | 'lil-bro'
  | 'big-sister'
  | 'little-sister'
  | 'old-english'
  | 'cockney'
  | 'celtic'
  | 'scouse'
  | 'wild-west'
  | 'asian-uncle'
  | 'russian-mafia'
  | 'pirate'
  | 'alien'
  | 'e-girl'
  | 'chad'
  | 'hopeless-romantic'
  | 'conservative'
  | 'liberal'
  | 'antifa'
  | 'capitalist'
  | 'socialist'
  | 'neocon'
  | 'feminist'
  | 'progressive'
  | 'nationalist'
  | 'communist';

/** Text-enhancement modes accepted by the shared `enhance-text` edge function. */
export type EnhanceMode = 'spellcheck' | 'grammar' | 'style';

/**
 * Enhance post copy through the same `enhance-text` edge function dehubweb's
 * post composer uses, so both apps produce identical results for a given
 * mode/style. The function is public (IP rate-limited), so no auth header.
 */
export async function enhanceText(
  text: string,
  mode: EnhanceMode = 'spellcheck',
  style?: string,
): Promise<string> {
  const res = await fetch(`${EDGE_BASE}/enhance-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text.trim(), mode, style }),
  });

  const raw = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {
    log.error('enhanceText: unparseable response', res.status, raw.substring(0, 200));
  }

  if (!res.ok || data?.error) {
    // The function returns a human-readable `error` for rate limits (429) and
    // an unpaid job (402) — surface it rather than a generic failure.
    throw new Error(data?.error || `Failed to process text (${res.status})`);
  }

  const enhanced = data?.enhancedText;
  if (typeof enhanced !== 'string' || !enhanced.trim()) {
    throw new Error('Failed to process text');
  }
  return enhanced.trim();
}

export type AIModel =
  | 'auto'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gpt-5-mini'
  | 'grok-4';

/**
 * Which surface is asking. `assistant` gets the full tool set, including the
 * caller's own account data; `chat` is the public-room bot and is limited to
 * tools that read public data only.
 */
export type AISurface = 'assistant' | 'chat';

export interface AIChatRequest {
  messages: AIChatMessage[];
  style?: AIStyle;
  model?: AIModel;
  isAuthenticated?: boolean;
  userLanguage?: string;
  postContext?: AIPostContext;
  userContext?: AIUserContext;
  dehubToken?: string;
  surface?: AISurface;
  /** Wallet of the asking user — scopes the personal-data tools to them. */
  callerAddress?: string;
}

/** One tool the assistant ran while answering. */
export interface AIToolTraceEntry {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
}

export interface AIChatResponse {
  response: string;
  searchUsed: boolean;
  fallbackUsed: boolean;
  modelUsed: string;
  modelTier: string;
  modelReason: string;
  /** Present when the tool-calling agent handled the request. */
  toolTrace?: AIToolTraceEntry[];
  agentRounds?: number;
}

/**
 * Image model key. Deliberately a string keyed off
 * `config/ai-models.constants.ts` rather than a hand-kept union — the
 * catalogue is 16 models now and grows server-first, and a stale union here
 * only stops the client offering models that already work.
 *
 * The old union carried `grok-aurora` and `gpt-5`, neither of which
 * generate-image has ever accepted. The xAI model's real id is `grok-2-image`.
 */
export type AIImageModel = string;

export interface AIImageRequest {
  prompt: string;
  sourceImage?: string;
  conversationHistory?: AIChatMessage[];
  model?: AIImageModel;
  /** Base64 wordmark to composite — the poster studio's brand path. */
  logoImage?: string;
  /**
   * Explicit headline channel. An empty string means "the user chose no
   * headline", so the server must not regex-mine one out of the prompt.
   */
  headline?: string;
  /** 'template' forces the on-brand SM Template banner; 'scene' diffuses. */
  bannerRenderer?: 'template' | 'scene';
  bannerFormat?: 'landscape' | 'square' | 'portrait';
  /** Hash of the DHB transfer that paid for this job. */
  txHash?: string;
}

export interface AIImageResponse {
  imageUrl: string;
  text: string;
  success: boolean;
  error?: string;
  safetyBlocked?: boolean;
  clearHistory?: boolean;
}

export type AIVideoModel = string;

export interface AIVideoRequest {
  prompt: string;
  model: AIVideoModel;
  sourceImage?: string;
  duration?: '5s' | '10s';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  negativePrompt?: string;
  resolution?: string;
  seed?: number;
  /** Hash of the DHB transfer that paid for this job. */
  txHash?: string;
}

export interface AIVideoResponse {
  status: 'starting' | 'processing' | 'succeeded' | 'failed';
  predictionId: string;
  videoUrl?: string;
  /** Which backend holds this prediction; must be handed back when polling. */
  provider?: string;
  falAppId?: string;
  error?: string;
}

export interface AIErrorResponse {
  error: string;
  errorCode?:
    | 'RATE_LIMIT'
    | 'CREDITS_EXHAUSTED'
    | 'UPSTREAM_ERROR'
    | 'TIMEOUT'
    | 'INTERNAL_ERROR'
    | 'UNAUTHENTICATED';
  /** What `_shared/ai-payment-guard.ts` calls it: 'PAYMENT_REQUIRED'. */
  code?: string;
  /** Price of the refused job, returned alongside a 402. */
  priceDhb?: number;
  safetyBlocked?: boolean;
  clearHistory?: boolean;
}

async function edgeFetch<T>(
  functionName: string,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = `${EDGE_BASE}/${functionName}`;
  const payloadSize = JSON.stringify(body).length;
  const msgCount = Array.isArray(body.messages) ? body.messages.length : 0;
  const hasPostCtx = !!body.postContext;
  log.debug(`POST ${functionName} | msgs=${msgCount} postCtx=${hasPostCtx} payload=${payloadSize}B`);

  const t0 = Date.now();

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
    body: JSON.stringify(body),
  });

  const tNetwork = Date.now() - t0;
  const data = await res.json();
  const tTotal = Date.now() - t0;

  log.debug(`${functionName} | status=${res.status} network=${tNetwork}ms total=${tTotal}ms`);

  if (!res.ok) {
    const err = data as AIErrorResponse;
    log.error(`${functionName} failed (${res.status}) after ${tTotal}ms:`, err.error);
    throw new AIServiceError(
      err.error || `AI request failed (${res.status})`,
      res.status,
      // The payment guard answers `code`, the older functions answer
      // `errorCode`. Read both, or a 402 arrives as an unlabelled failure and
      // the retry loop hammers a charge that will never succeed.
      err.errorCode || err.code || inferErrorCode(res.status),
      err.safetyBlocked,
      err.clearHistory,
      err.priceDhb,
    );
  }

  return data as T;
}

function inferErrorCode(status: number): string | undefined {
  if (status === 429) return 'RATE_LIMIT';
  if (status === 402) return 'CREDITS_EXHAUSTED';
  if (status === 401 || status === 403) return 'UNAUTHENTICATED';
  return undefined;
}

/**
 * `edgeFetch` with the paid-endpoint auth headers attached.
 *
 * Status polls go through here too. Polls are not charged — the functions
 * return before the debit when a predictionId is present — but they still have
 * to authenticate.
 */
async function paidEdgeFetch<T>(
  functionName: string,
  body: Record<string, unknown>,
  walletAddress?: string | null,
): Promise<T> {
  return edgeFetch<T>(functionName, body, await dehubAuthHeaders(walletAddress));
}

export class AIServiceError extends Error {
  status: number;
  errorCode?: string;
  safetyBlocked?: boolean;
  clearHistory?: boolean;
  priceDhb?: number;

  constructor(
    message: string,
    status: number,
    errorCode?: string,
    safetyBlocked?: boolean,
    clearHistory?: boolean,
    priceDhb?: number,
  ) {
    super(message);
    this.name = 'AIServiceError';
    this.status = status;
    this.errorCode = errorCode;
    this.safetyBlocked = safetyBlocked;
    this.clearHistory = clearHistory;
    this.priceDhb = priceDhb;
  }
}

/**
 * True when a call was refused over payment rather than a broken request, so
 * callers can send the user back to the paywall instead of a generic error.
 * Mirrors web's `isPaymentRequired`.
 */
export function isPaymentRequired(error: unknown): boolean {
  if (error instanceof AIServiceError) {
    if (error.status === 402) return true;
    if (
      error.errorCode === 'PAYMENT_REQUIRED' ||
      error.errorCode === 'PAYMENT_EXHAUSTED' ||
      error.errorCode === 'PAYMENT_UNVERIFIED' ||
      error.errorCode === 'CREDITS_EXHAUSTED'
    ) {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('PAYMENT_REQUIRED') ||
    message.includes('PAYMENT_EXHAUSTED') ||
    message.includes('PAYMENT_UNVERIFIED') ||
    message.includes('costs DHB')
  );
}

/**
 * Strip a thread down to what the model is given.
 *
 * Only `role` and `content` travel, exactly as web does it. Sending the stored
 * objects would put every generated image URL — and worse, the base64 data URL
 * of anything the user attached — into the prompt payload on every turn.
 */
export function toChatTurns(messages: AIChatMessage[]): AIChatMessage[] {
  return messages.map(({ role, content }) => ({ role, content }));
}

export async function sendAIChat(request: AIChatRequest): Promise<AIChatResponse> {
  return edgeFetch<AIChatResponse>('general-ai-chat', {
    ...request,
    messages: toChatTurns(request.messages),
  } as unknown as Record<string, unknown>);
}

export async function generateImage(
  request: AIImageRequest,
  walletAddress?: string | null,
): Promise<AIImageResponse> {
  return paidEdgeFetch<AIImageResponse>(
    'generate-image',
    {
      ...request,
      ...(request.conversationHistory
        ? { conversationHistory: toChatTurns(request.conversationHistory) }
        : {}),
    } as unknown as Record<string, unknown>,
    walletAddress,
  );
}

export async function startVideoGeneration(
  request: AIVideoRequest,
  walletAddress?: string | null,
): Promise<AIVideoResponse> {
  return paidEdgeFetch<AIVideoResponse>(
    'generate-video',
    request as unknown as Record<string, unknown>,
    walletAddress,
  );
}

/**
 * Poll a render. `provider` and `falAppId` come back from the start call and
 * have to be handed back — generate-video routes across Replicate, fal and kie,
 * and without them it cannot tell which one holds this prediction.
 */
export async function pollVideoGeneration(
  predictionId: string,
  opts?: { provider?: string; falAppId?: string; walletAddress?: string | null },
): Promise<AIVideoResponse> {
  return paidEdgeFetch<AIVideoResponse>(
    'generate-video',
    {
      predictionId,
      ...(opts?.provider ? { provider: opts.provider } : {}),
      ...(opts?.falAppId ? { falAppId: opts.falAppId } : {}),
    },
    opts?.walletAddress,
  );
}

/* ── fal.ai tools (music, TTS, upscale, background removal, Whisper) ─────── */

export interface AiToolRequest {
  /** Tool key from `AI_TOOL_MODELS`, e.g. 'minimax-music'. */
  tool: string;
  prompt?: string;
  /** TTS reads this rather than `prompt`. */
  text?: string;
  /** Lyrics for the music tools, kept separate from the style prompt. */
  lyrics?: string;
  /** Public URL of the source image for upscale / background removal. */
  image_url?: string;
  /** Public URL of the audio for Whisper. */
  audio_url?: string;
  /** Hash of the DHB transfer that paid for this run. */
  txHash?: string;
}

export interface AiToolResponse {
  status?: 'succeeded' | 'failed' | 'processing' | 'in_queue' | 'starting';
  /** Present on async tools — poll with `pollAiTool`. */
  requestId?: string;
  appId?: string;
  statusUrl?: string;
  responseUrl?: string;
  imageUrl?: string;
  audioUrl?: string;
  /** Whisper transcript. */
  text?: string;
  error?: string;
}

export async function startAiTool(
  request: AiToolRequest,
  walletAddress?: string | null,
): Promise<AiToolResponse> {
  return paidEdgeFetch<AiToolResponse>(
    'fal-ai-tools',
    request as unknown as Record<string, unknown>,
    walletAddress,
  );
}

export async function pollAiTool(
  args: { requestId: string; appId: string; statusUrl?: string; responseUrl?: string },
  walletAddress?: string | null,
): Promise<AiToolResponse> {
  return paidEdgeFetch<AiToolResponse>(
    'fal-ai-tools',
    args as unknown as Record<string, unknown>,
    walletAddress,
  );
}

/* ── Job pricing ─────────────────────────────────────────────────────────── */

export type AiJobKind = 'image' | 'video' | 'model3d' | 'tool';

export interface AiQuoteRequest {
  kind: AiJobKind;
  modelId: string;
  durationSeconds?: number;
  quality?: 'none' | 'standard' | 'HD';
  quantity?: number;
}

/**
 * What a job will cost, priced by the same code that takes the money.
 *
 * The client deliberately does not work this out: the figure a paywall shows
 * has to be the figure that gets charged, and only the server knows the
 * pricing table. `config/ai-models.constants.ts` keeps indicative numbers for
 * the picker rows and nothing else.
 *
 * No wallet is needed — the price of a model is not private.
 */
export async function quoteAiJob(
  request: AiQuoteRequest,
): Promise<{ priceDhb: number; priceUsd: number }> {
  return paidEdgeFetch<{ priceDhb: number; priceUsd: number }>(
    'ai-quote',
    { ...request } as unknown as Record<string, unknown>,
  );
}



/* ── Payment receipts ────────────────────────────────────────────────────── */

export interface AiPaymentReceipt {
  txHash: string;
  chain: string;
  paidDhb: number;
  remainingDhb: number;
  purpose: string;
  createdAt: string;
}

/**
 * Write a mined transfer down before anything tries to spend it.
 *
 * Until `ai-payment-record` existed, a receipt was only created inside the
 * generation function's payment guard — so a transfer that was signed and
 * mined, but whose generation request never arrived, left DHB in the treasury
 * with no row anywhere saying whose it was. Four payments went that way in the
 * first week of pay-per-job.
 *
 * Idempotent on the hash, and safe to call on a transfer we are not sure
 * landed: the server verifies it against the chain and refuses one it cannot
 * find.
 */
export async function recordAiPayment(
  txHash: string,
  walletAddress?: string | null,
  purpose: 'job' | 'voice' = 'job',
): Promise<AiPaymentReceipt> {
  return paidEdgeFetch<AiPaymentReceipt>('ai-payment-record', { txHash, purpose }, walletAddress);
}

/**
 * DHB this wallet has already paid and not yet spent, newest first.
 *
 * The authority is the server, not the device — which is what makes a payment
 * survive the app being killed, reinstalled, or opened on another phone.
 */
export async function listUnspentAiPayments(
  walletAddress?: string | null,
): Promise<AiPaymentReceipt[]> {
  const res = await paidEdgeFetch<{ payments?: AiPaymentReceipt[] }>(
    'ai-payment-record',
    { action: 'list' },
    walletAddress,
  );
  return res.payments ?? [];
}
/* ── Streaming chat ──────────────────────────────────────────────────────── */

export interface StreamChatHandlers {
  onDelta: (text: string) => void;
  onMeta?: (meta: {
    modelUsed?: string;
    modelTier?: string;
    modelReason?: string;
    fallbackUsed?: boolean;
    toolTrace?: AIToolTraceEntry[];
  }) => void;
  /**
   * Fired while the assistant is looking things up, before any text arrives —
   * so the UI can say what it is doing instead of showing a bare spinner.
   */
  onTool?: (event: { status: 'running' | 'done'; tools: string[] }) => void;
  onDone: () => void;
  onError: (error: AIServiceError) => void;
}

/** Handle returned by `streamAIChat` so a caller can abandon a stream. */
export interface StreamHandle {
  abort: () => void;
}

/**
 * Token-by-token chat, matching dehubweb's `src/lib/stream-chat.ts`.
 *
 * This is XHR rather than `fetch` on purpose. React Native's fetch is a
 * whatwg-fetch shim over XHR and never populates `response.body`, so the
 * web client's `resp.body.getReader()` loop cannot be ported directly — it
 * would resolve with the whole answer at once, which is exactly the
 * non-streaming behaviour this replaces. XHR's `onprogress` does expose the
 * partial `responseText`, so the SSE frames are parsed out of the growing
 * buffer instead.
 */
export function streamAIChat(
  request: AIChatRequest,
  handlers: StreamChatHandlers,
): StreamHandle {
  const { onDelta, onMeta, onTool, onDone, onError } = handlers;
  const xhr = new XMLHttpRequest();
  let consumed = 0;
  let carry = '';
  let finished = false;

  const finish = (fn: () => void) => {
    if (finished) return;
    finished = true;
    fn();
  };

  /** Consume whole `data:` lines out of the buffer; keep any partial tail. */
  const drain = (chunk: string) => {
    carry += chunk;
    let newlineIndex: number;
    while ((newlineIndex = carry.indexOf('\n')) !== -1) {
      let line = carry.slice(0, newlineIndex);
      carry = carry.slice(newlineIndex + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (!line.startsWith('data: ')) continue;

      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.__meta) {
          onMeta?.(parsed.__meta);
          continue;
        }
        if (parsed.__tool) {
          onTool?.(parsed.__tool);
          continue;
        }
        const content = parsed?.choices?.[0]?.delta?.content;
        if (typeof content === 'string' && content) onDelta(content);
      } catch {
        // A frame split across two progress events. Put it back and wait for
        // the rest rather than dropping a token.
        carry = `${line}\n${carry}`;
        return;
      }
    }
  };

  xhr.open('POST', `${EDGE_BASE}/general-ai-chat`);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');

  xhr.onprogress = () => {
    // A non-200 streams its JSON error body through the same channel; leave it
    // for onload to parse rather than trying to read it as SSE.
    if (xhr.status !== 200) return;
    const text = xhr.responseText || '';
    if (text.length <= consumed) return;
    const chunk = text.slice(consumed);
    consumed = text.length;
    drain(chunk);
  };

  xhr.onload = () => {
    if (xhr.status !== 200) {
      let parsed: AIErrorResponse | null = null;
      try {
        parsed = JSON.parse(xhr.responseText || '{}');
      } catch {
        parsed = null;
      }
      finish(() =>
        onError(
          new AIServiceError(
            parsed?.error || `AI request failed (${xhr.status})`,
            xhr.status,
            parsed?.errorCode || parsed?.code || inferErrorCode(xhr.status),
            parsed?.safetyBlocked,
            parsed?.clearHistory,
            parsed?.priceDhb,
          ),
        ),
      );
      return;
    }

    // Flush whatever arrived between the last progress event and completion.
    const text = xhr.responseText || '';
    if (text.length > consumed) {
      drain(text.slice(consumed));
      consumed = text.length;
    }
    // A lenient last pass over the tail. `drain` stops at anything it cannot
    // parse, on the assumption the rest is still coming; nothing is coming now,
    // so a final frame with no trailing newline is read here or lost.
    if (carry.trim()) {
      for (let raw of carry.split('\n')) {
        if (raw.endsWith('\r')) raw = raw.slice(0, -1);
        if (!raw.startsWith('data: ')) continue;
        const payload = raw.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.__meta) {
            onMeta?.(parsed.__meta);
            continue;
          }
          if (parsed.__tool) {
            onTool?.(parsed.__tool);
            continue;
          }
          const content = parsed?.choices?.[0]?.delta?.content;
          if (typeof content === 'string' && content) onDelta(content);
        } catch {
          // Genuinely truncated. Nothing left to wait for.
        }
      }
      carry = '';
    }

    finish(onDone);
  };

  xhr.onerror = () => {
    finish(() => onError(new AIServiceError('Network error talking to the assistant', 0)));
  };

  xhr.ontimeout = () => {
    finish(() => onError(new AIServiceError('The assistant took too long to answer', 0, 'TIMEOUT')));
  };

  xhr.send(
    JSON.stringify({ ...request, messages: toChatTurns(request.messages), stream: true }),
  );

  return {
    abort: () => {
      if (finished) return;
      finished = true;
      try {
        xhr.abort();
      } catch {
        // Already settled.
      }
    },
  };
}

/** One turn of chat context handed to the reply drafter. */
export interface SmartReplyTurn {
  from: 'me' | 'them';
  name?: string;
  text: string;
}

export interface SmartReplySuggestion {
  /** 2-4 words naming the move — "Turn it back". This is what users read. */
  label: string;
  /** The reply itself, inserted into the composer on tap. */
  text: string;
}

export interface SmartReplyResponse {
  suggestions: SmartReplySuggestion[];
  /** 'awaiting-reply' when the user sent last — an empty list, not a failure. */
  reason?: string;
}

/**
 * Drafts two replies to the newest incoming message.
 *
 * Shares the `suggest-replies` edge function with dehubweb, so both apps
 * suggest the same thing for the same thread. Trimming and the safety rails
 * live server side; callers just hand over the tail of the conversation,
 * oldest first.
 */
export async function suggestReplies(
  thread: SmartReplyTurn[],
  peerName?: string,
): Promise<SmartReplyResponse> {
  return edgeFetch<SmartReplyResponse>('suggest-replies', { thread, peerName });
}

/* ── Request classification ──────────────────────────────────────────────── */
/*
 * The phrase lists and the matching rules now live in `./ai-intent`, shared
 * verbatim with dehubweb's `src/lib/ai-intent.ts` so the same sentence routes
 * the same way on both. They are re-exported under the names this module has
 * always used.
 *
 * The reason they moved: the lists were matched with `includes()`, so `'draw'`
 * matched inside "withdrawal" and a support question about unstaked tokens
 * opened the image paywall instead of being answered.
 */

export {
  detectAiToolRequest,
  isCreativeLogoRequest,
  isDeHubBrandedImageRequest,
  isSupportQuestion,
  requiresLogoAsset,
} from './ai-intent';
export type { AiToolCategory } from './ai-intent';

export function isVideoRequest(text: string): boolean {
  return requiresVideoGeneration(text);
}

/**
 * Whether to route to the image generator. A video request wins — half the
 * video phrases ("animate this picture") also match an image keyword.
 *
 * `conversational` is on because every image surface on this app confirms the
 * price in a paywall sheet before anything is signed, which is what makes the
 * looser phrasing ("what does a DeHub poster look like") safe to route.
 */
export function isImageRequest(text: string, hasAttachedImage = false): boolean {
  return requiresImageGeneration(text, hasAttachedImage, { conversational: true });
}

/**
 * The brand system wrapper web sends with a poster prompt. Kept identical so a
 * poster made on a phone looks like one made on the desktop — the typeface,
 * the palette rule and the links block are all load-bearing.
 */
export function buildDeHubBrandPrompt(userRequest: string): string {
  return `DEHUB BRAND SYSTEM (mandatory):
- The attached image is the official DeHub wordmark. Composite it prominently, crisp, unaltered, pure white, with clear space around it. Do not redraw, recolor, gradient-fill, warp, or replace it.
- Palette: deep black / charcoal backgrounds, white text, subtle white-opacity accents. Never use blue.
- Aesthetic: liquid glass, frosted blur, cinematic, premium, decentralized-tech, lots of negative space, strong focal hierarchy.
- Typography if any: use the Exo / Exo 2 typeface family (geometric technical sans-serif) for ALL rendered text — Light/Regular for body and links, Medium/SemiBold for headings, Bold only for short display words. Pure white, generous letter-spacing. Never Inter, Poppins, DM Sans, serifs, or script. Fallbacks: Eurostile, Michroma, Rajdhani. No emoji. No generic AI clichés.

OFFICIAL DEHUB LINKS (render ONLY if the user explicitly asks for socials, links, website, QR, or contact info — otherwise omit entirely):
- Website: dehub.io
- X / Twitter: x.com/dehub_official
- Telegram (main): t.me/dehub_dhb
- Discord: discord.gg/dehub
- Regional Telegrams: Turkish t.me/Dehub_Turkish · Arabic t.me/Dehub_Arabic · Hindi t.me/dehub_hindi · China t.me/dehub_china · Indonesia t.me/dehub_indonesia · Germany t.me/dehub_dach · Vietnam t.me/dehub_vietnam · Philippines t.me/DeHub_Philippines
When rendering links: pure white, Exo / Exo 2 (Light or Regular), small size, bottom of composition, generous letter-spacing, no icons unless requested. Only include the specific links the user asked for (socials means X + Telegram + Discord + Website; website means just dehub.io).

USER REQUEST: ${userRequest}`;
}

/**
 * Human-readable status for the tools the agent runs mid-answer, so the
 * spinner can say what is happening. Falls back to the raw tool name, which is
 * what lets a newly added backend tool read sensibly with no client release.
 */
const TOOL_LABELS: Record<string, string> = {
  lookup_user: 'Looking up that profile',
  user_posts: 'Reading their posts',
  search: 'Searching DeHub',
  get_feed: 'Checking the feed',
  get_post: 'Opening that post',
  get_followers: 'Checking followers',
  get_leaderboard: 'Checking the leaderboard',
  get_live_streams: 'Checking who is live',
  get_platform_stats: 'Checking platform stats',
  get_chat_history: 'Reading recent chat',
  get_top_categories: 'Checking trending categories',
  my_wallet: 'Checking your wallet',
  my_earnings: 'Adding up your earnings',
  my_stats: 'Checking your stats',
  my_notifications: 'Checking your notifications',
  my_library: 'Checking your library',
  my_settings: 'Checking your settings',
  my_engagement_history: 'Checking who you engage with',
  web_search: 'Searching the web',
};

export function describeTools(tools: string[]): string {
  if (!tools.length) return '';
  const label = TOOL_LABELS[tools[0]] || `Running ${tools[0].replace(/_/g, ' ')}`;
  return tools.length > 1 ? `${label} (+${tools.length - 1} more)…` : `${label}…`;
}

export async function getDHBPrice(): Promise<number> {
  const url = `${EDGE_BASE}/get-dhb-price`;
  log.debug('getDHBPrice: fetching from', url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    log.debug('getDHBPrice: response status', res.status);
    const text = await res.text();
    log.debug('getDHBPrice: raw response', text.substring(0, 500));

    if (!res.ok) {
      log.error('getDHBPrice: HTTP error', res.status, text);
      throw new Error(`getDHBPrice failed (${res.status}): ${text}`);
    }

    const data = JSON.parse(text);
    const price =
      data?.prices?.DHB ??
      data?.price ??
      data?.data?.price ??
      data?.usdPrice ??
      0;
    log.debug('getDHBPrice: parsed price', price);

    if (typeof price !== 'number' || price <= 0) {
      log.error('getDHBPrice: invalid price value', data);
      throw new Error('Invalid DHB price returned');
    }

    return price;
  } catch (err) {
    log.error('getDHBPrice: exception', err);
    throw err;
  }
}
