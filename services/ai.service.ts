import env from '../config/env';
import { createLogger } from '../libs/logger';

const log = createLogger('ai.service');

const EDGE_BASE = env.SUPABASE_EDGE_BASE_URL;

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
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

export type AIModel =
  | 'auto'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gpt-5-mini'
  | 'grok-4';

export interface AIChatRequest {
  messages: AIChatMessage[];
  style?: AIStyle;
  model?: AIModel;
  isAuthenticated?: boolean;
  userLanguage?: string;
  postContext?: AIPostContext;
  userContext?: AIUserContext;
  dehubToken?: string;
}

export interface AIChatResponse {
  response: string;
  searchUsed: boolean;
  fallbackUsed: boolean;
  modelUsed: string;
  modelTier: string;
  modelReason: string;
}

export type AIImageModel =
  | 'gemini-2.5-flash'
  | 'gemini-3-pro-image'
  | 'grok-aurora'
  | 'gpt-5';

export interface AIImageRequest {
  prompt: string;
  sourceImage?: string;
  conversationHistory?: AIChatMessage[];
  model?: AIImageModel;
}

export interface AIImageResponse {
  imageUrl: string;
  text: string;
  success: boolean;
}

export type AIVideoModel =
  | 'kling-2.6-pro'
  | 'luma-ray2'
  | 'minimax-video'
  | 'runway-gen4'
  | 'ltx-video';

export interface AIVideoRequest {
  prompt: string;
  model: AIVideoModel;
  sourceImage?: string;
  duration?: '5s' | '10s';
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

export interface AIVideoResponse {
  status: 'starting' | 'processing' | 'succeeded' | 'failed';
  predictionId: string;
  videoUrl?: string;
}

export interface AIErrorResponse {
  error: string;
  errorCode?: 'RATE_LIMIT' | 'CREDITS_EXHAUSTED' | 'UPSTREAM_ERROR' | 'TIMEOUT' | 'INTERNAL_ERROR';
  safetyBlocked?: boolean;
  clearHistory?: boolean;
}

async function edgeFetch<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${EDGE_BASE}/${functionName}`;
  log.debug(`POST ${functionName}`, Object.keys(body));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    const err = data as AIErrorResponse;
    log.error(`${functionName} failed (${res.status}):`, err.error);
    throw new AIServiceError(
      err.error || `AI request failed (${res.status})`,
      res.status,
      err.errorCode,
      err.safetyBlocked,
      err.clearHistory,
    );
  }

  return data as T;
}

export class AIServiceError extends Error {
  status: number;
  errorCode?: string;
  safetyBlocked?: boolean;
  clearHistory?: boolean;

  constructor(
    message: string,
    status: number,
    errorCode?: string,
    safetyBlocked?: boolean,
    clearHistory?: boolean,
  ) {
    super(message);
    this.name = 'AIServiceError';
    this.status = status;
    this.errorCode = errorCode;
    this.safetyBlocked = safetyBlocked;
    this.clearHistory = clearHistory;
  }
}

export async function sendAIChat(request: AIChatRequest): Promise<AIChatResponse> {
  return edgeFetch<AIChatResponse>('general-ai-chat', request as unknown as Record<string, unknown>);
}

export async function generateImage(request: AIImageRequest): Promise<AIImageResponse> {
  return edgeFetch<AIImageResponse>('generate-image', request as unknown as Record<string, unknown>);
}

export async function startVideoGeneration(request: AIVideoRequest): Promise<AIVideoResponse> {
  return edgeFetch<AIVideoResponse>('generate-video', request as unknown as Record<string, unknown>);
}

export async function pollVideoGeneration(predictionId: string): Promise<AIVideoResponse> {
  return edgeFetch<AIVideoResponse>('generate-video', { predictionId });
}

const IMAGE_VERBS = /\b(generate|create|make|draw|design|paint|sketch|render|show me)\b/i;
const IMAGE_NOUNS = /\b(image|picture|photo|drawing|illustration|art|artwork|graphic|portrait|logo|icon|wallpaper)\b/i;
const VIDEO_NOUNS = /\b(video|animation|clip|footage)\b/i;

export function isImageRequest(text: string): boolean {
  return IMAGE_VERBS.test(text) && IMAGE_NOUNS.test(text);
}

export function isVideoRequest(text: string): boolean {
  return IMAGE_VERBS.test(text) && VIDEO_NOUNS.test(text);
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
