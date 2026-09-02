import { dmActions } from "../../store/dm.store";
import { DMSocketEvent } from "../enums/dm-socket-events.enum";
import { uploadDmMedia, tipNotify } from "./dm.api";
import { guessMime } from "../../libs/assets.util";
import { createLogger } from "../../libs/logger";
import { supportedTokens } from "../../config/constants";
import type {
  ID,
  DmMessage,
  DmFee,
  DmMsgType,
  OptimisticMessage,
  ReplyPreview,
  DmMediaUrl,
} from "./dm.types";
import { DM_VIDEO_MAX_SIZE } from "./dm.types";
import * as FileSystem from "expo-file-system/legacy";
import { prepareOutgoing } from "../../libs/dm-e2ee/keys";
import { peerAddressForConversation } from "../../libs/dm-e2ee/peer";

const log = createLogger("DmSendQueue");


const UPLOAD_TIMEOUT_IMAGE = 60_000; // 60s
const UPLOAD_TIMEOUT_VIDEO = 120_000; // 120s
const FEE_PAYMENT_TIMEOUT = 30_000; // 30s
const MAX_UPLOAD_RETRIES = 2;


/** Minimal WebSocket interface — matches WebSocketContextValue */
interface WsRef {
  emitAuthed: (event: string, payload?: any) => void;
  on: (event: string, handler: (data: any) => void) => () => void;
  off: (event: string, handler: (data: any) => void) => void;
}


type FeePayer = (feeAmount: number) => Promise<string>;


type ConversationResolver = () => Promise<ID>;


interface BaseSendJob {
  tempId: string;
  conversationId: ID;
  userId: string;
  address: string;
  replyTo?: DmMessage | null;
  dmFee?: DmFee | null;
  tipAmount?: number;
}

interface TextSendJob extends BaseSendJob {
  kind: "text";
  content: string;
  /** Client-side forward of an encrypted message: cite the original, re-encrypt the text. */
  forwardedFrom?: { messageId: ID };
}

interface GifSendJob extends BaseSendJob {
  kind: "gif";
  gifUrl: string;
  caption?: string;
}

interface MediaSendJob extends BaseSendJob {
  kind: "media";
  uri: string;
  thumbnailUri?: string;
  mediaType: "image" | "video" | "file";
  mimeType: string;
  caption?: string;
  msgType?: DmMsgType;
  voiceDuration?: number;
  /**
   * Documents only. The server validates a document by its **extension**, so
   * the real filename has to survive the trip — the synthesised
   * `${Date.now()}.jpg` used for photos would be rejected as a type mismatch.
   */
  fileName?: string;
  fileSize?: number;
}

interface TipSendJob extends BaseSendJob {
  kind: "tip";
  tipAmount: number;
}

type FastJob = TextSendJob | GifSendJob;
type SlowJob = MediaSendJob | TipSendJob;
type SendJob = FastJob | SlowJob;


/** Race a promise against a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

/** Retry an async fn up to `retries` times with exponential backoff. */
async function withRetry<T>(fn: () => Promise<T>, retries: number, label: string): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (attempt < retries) {
        const delay = 1000 * 2 ** attempt; // 1s, 2s
        log.warn(`${label} attempt ${attempt + 1} failed, retrying in ${delay}ms:`, e?.message);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}


class DmSendQueue {
  private ws: WsRef | null = null;
  private feePayer: FeePayer | null = null;
  private conversationResolver: ConversationResolver | null = null;

  // Two independent lanes
  private fastQueue: FastJob[] = [];
  private slowQueue: SlowJob[] = [];
  private fastProcessing = false;
  private slowProcessing = false;

  private counter = 0;

  /** Call once from a top-level provider to inject WebSocket reference. */
  init(ws: WsRef): void {
    this.ws = ws;
    log.debug("init: ws injected");
  }

  setFeePayer(fn: FeePayer | null): void {
    this.feePayer = fn;
  }

  setConversationResolver(fn: ConversationResolver | null): void {
    this.conversationResolver = fn;
  }


  sendText(params: {
    conversationId: ID;
    userId: string;
    address: string;
    content: string;
    replyTo?: DmMessage | null;
    dmFee?: DmFee | null;
    tipAmount?: number;
    forwardedFrom?: { messageId: ID };
  }): string {
    const tempId = this.makeTempId();
    const { conversationId, userId, content, replyTo, dmFee, address, tipAmount, forwardedFrom } = params;

    const feeRequired = !!dmFee?.required && !dmFee?.hasFreeAccess;
    const paymentAmount = tipAmount || (feeRequired ? dmFee?.fee : undefined) || undefined;
    const optimistic = this.buildOptimistic({
      tempId,
      conversationId,
      userId,
      content,
      msgType: "msg",
      replyTo,
      tipAmount: paymentAmount,
      paymentStatus: paymentAmount ? "pending" : undefined,
    });
    if (forwardedFrom) optimistic.isForwarded = true;
    dmActions.addOptimistic(conversationId, optimistic);

    this.enqueueFast({
      kind: "text",
      tempId,
      conversationId,
      userId,
      address,
      content,
      replyTo,
      dmFee,
      tipAmount,
      forwardedFrom,
    });

    return tempId;
  }

  sendGif(params: {
    conversationId: ID;
    userId: string;
    address: string;
    gifUrl: string;
    caption?: string;
    replyTo?: DmMessage | null;
    dmFee?: DmFee | null;
    tipAmount?: number;
  }): string {
    const tempId = this.makeTempId();
    const { conversationId, userId, gifUrl, caption, replyTo, dmFee, address, tipAmount } = params;

    const feeRequired = !!dmFee?.required && !dmFee?.hasFreeAccess;
    const paymentAmount = tipAmount || (feeRequired ? dmFee?.fee : undefined) || undefined;
    const optimistic = this.buildOptimistic({
      tempId,
      conversationId,
      userId,
      content: caption || "",
      msgType: "gif",
      replyTo,
      mediaUrls: [{ url: gifUrl, type: "gif", mimeType: "image/gif" }],
      tipAmount: paymentAmount,
      paymentStatus: paymentAmount ? "pending" : undefined,
    });
    dmActions.addOptimistic(conversationId, optimistic);

    this.enqueueFast({
      kind: "gif",
      tempId,
      conversationId,
      userId,
      address,
      gifUrl,
      caption,
      replyTo,
      dmFee,
      tipAmount,
    });

    return tempId;
  }

  sendMedia(params: {
    conversationId: ID;
    userId: string;
    address: string;
    uri: string;
    thumbnailUri?: string;
    mediaType: "image" | "video" | "file";
    mimeType?: string;
    caption?: string;
    replyTo?: DmMessage | null;
    dmFee?: DmFee | null;
    tipAmount?: number;
    msgType?: DmMsgType;
    voiceDuration?: number;
    fileName?: string;
    fileSize?: number;
  }): string {
    const tempId = this.makeTempId();
    const {
      conversationId, userId, uri, thumbnailUri, mediaType,
      caption, replyTo, dmFee, address, tipAmount,
    } = params;
    const effectiveMsgType = params.msgType || "media";

    const mime = params.mimeType || guessMime(
      uri,
      mediaType === "video" ? "video/mp4" : mediaType === "file" ? "application/octet-stream" : "image/jpeg",
    );

    const feeRequired = !!dmFee?.required && !dmFee?.hasFreeAccess;
    const paymentAmount = tipAmount || (feeRequired ? dmFee?.fee : undefined) || undefined;
    const optimistic = this.buildOptimistic({
      tempId,
      conversationId,
      userId,
      content: caption || "",
      msgType: effectiveMsgType,
      replyTo,
      mediaUrls: [{
        url: uri,
        type: mediaType,
        mimeType: mime,
        ...(mediaType === "file" && { name: params.fileName, size: params.fileSize }),
      }],
      // A document has no local preview to show, so it must not seed
      // localMediaUri — the bubble would try to render the file as an image.
      localMediaUri: effectiveMsgType === "voice" || mediaType === "file"
        ? undefined
        : (mediaType === "video" ? (thumbnailUri || uri) : uri),
      uploadStatus: "pending",
      tipAmount: paymentAmount,
      paymentStatus: paymentAmount ? "pending" : undefined,
      voiceDuration: params.voiceDuration,
    });
    dmActions.addOptimistic(conversationId, optimistic);

    this.enqueueSlow({
      kind: "media",
      tempId,
      conversationId,
      userId,
      address,
      uri,
      thumbnailUri,
      mediaType,
      mimeType: mime,
      caption,
      replyTo,
      dmFee,
      tipAmount,
      msgType: effectiveMsgType,
      voiceDuration: params.voiceDuration,
      fileName: params.fileName,
      fileSize: params.fileSize,
    });

    return tempId;
  }

  sendTip(params: {
    conversationId: ID;
    userId: string;
    address: string;
    tipAmount: number;
    dmFee?: DmFee | null;
  }): string {
    const tempId = this.makeTempId();
    const { conversationId, userId, tipAmount, address, dmFee } = params;

    const optimistic = this.buildOptimistic({
      tempId,
      conversationId,
      userId,
      content: "",
      msgType: "tip",
      tipAmount,
      paymentStatus: "pending",
    });
    dmActions.addOptimistic(conversationId, optimistic);

    this.enqueueSlow({
      kind: "tip",
      tempId,
      conversationId,
      userId,
      address,
      tipAmount,
      dmFee,
    });

    return tempId;
  }


  private enqueueFast(job: FastJob): void {
    this.fastQueue.push(job);
    this.processFast();
  }

  private enqueueSlow(job: SlowJob): void {
    this.slowQueue.push(job);
    this.processSlow();
  }


  private async processFast(): Promise<void> {
    if (this.fastProcessing || this.fastQueue.length === 0) return;
    this.fastProcessing = true;

    while (this.fastQueue.length > 0) {
      const job = this.fastQueue.shift()!;
      try {
        await this.executeFastJob(job);
      } catch (e: any) {
        log.error(`fast send failed [${job.kind}]:`, e?.message || e);
        dmActions.failOptimistic(job.conversationId, job.tempId, e?.message);
      }
    }

    this.fastProcessing = false;
  }


  private async processSlow(): Promise<void> {
    if (this.slowProcessing || this.slowQueue.length === 0) return;
    this.slowProcessing = true;

    while (this.slowQueue.length > 0) {
      const job = this.slowQueue.shift()!;
      try {
        await this.executeSlowJob(job);
      } catch (e: any) {
        log.error(`slow send failed [${job.kind}]:`, e?.message || e);
        dmActions.failOptimistic(job.conversationId, job.tempId, e?.message);
      }
    }

    this.slowProcessing = false;
  }


  private async executeFastJob(job: FastJob): Promise<void> {
    if (!this.ws) throw new Error("WebSocket not initialised");

    const convId = await this.resolveConversation(job);

    const { txHash, tipTxHash } = await this.payFeeIfNeeded(job);

    switch (job.kind) {
      case "text":
        await this.emitText(job, convId, txHash, tipTxHash);
        break;
      case "gif":
        await this.emitGif(job, convId, txHash, tipTxHash);
        break;
    }

    dmActions.removeOptimistic(convId, job.tempId);
  }


  private async executeSlowJob(job: SlowJob): Promise<void> {
    if (!this.ws) throw new Error("WebSocket not initialised");

    const convId = await this.resolveConversation(job);

    const { txHash, tipTxHash } = await this.payFeeIfNeeded(job);

    switch (job.kind) {
      case "media":
        await this.uploadMedia(job, convId, txHash, tipTxHash);
        break;
      case "tip":
        await this.executeTip(job, convId);
        break;
    }

    dmActions.removeOptimistic(convId, job.tempId);
  }


  private async resolveConversation(job: SendJob): Promise<ID> {
    let convId = job.conversationId;
    if (!convId || convId === "temp") {
      if (!this.conversationResolver) {
        throw new Error("No conversation resolver set — are you on the Chat screen?");
      }
      convId = await this.conversationResolver();
      if (job.conversationId === "temp") {
        dmActions.migrateOptimistic(job.conversationId, convId);
      }
      job.conversationId = convId;
    }
    return convId;
  }

  private async payFeeIfNeeded(job: SendJob): Promise<{ txHash?: string; tipTxHash?: string }> {
    let txHash: string | undefined;
    let tipTxHash: string | undefined;
    const feeRequired = !!job.dmFee?.required && !job.dmFee?.hasFreeAccess;
    const hasTip = job.kind !== "tip" && (job.tipAmount ?? 0) > 0;

    if (feeRequired && hasTip) {
      if (!this.feePayer) throw new Error("Wallet not connected");
      const amount = job.tipAmount!;
      log.debug("paying combined tip+fee:", amount, "DHB");
      const hash = await withTimeout(this.feePayer(amount), FEE_PAYMENT_TIMEOUT, "fee+tip payment");
      log.debug("combined tip+fee paid, hash:", hash);
      txHash = hash;
      tipTxHash = hash;
    } else if (feeRequired && job.kind !== "tip") {
      if (!this.feePayer) throw new Error("Wallet not connected");
      log.debug("paying fee:", job.dmFee!.fee, "DHB");
      txHash = await withTimeout(this.feePayer(job.dmFee!.fee), FEE_PAYMENT_TIMEOUT, "fee payment");
      log.debug("fee paid, txHash:", txHash);
    } else if (hasTip) {
      if (!this.feePayer) throw new Error("Wallet not connected");
      log.debug("paying attached tip:", job.tipAmount, "DHB");
      tipTxHash = await withTimeout(this.feePayer(job.tipAmount!), FEE_PAYMENT_TIMEOUT, "tip payment");
      log.debug("tip paid, tipTxHash:", tipTxHash);
    }

    return { txHash, tipTxHash };
  }


  /**
   * Text travels encrypted when both sides have keys. The peer is resolved
   * from the conversation, not the message, because the session key is the
   * same in both directions; when it cannot be resolved (or the peer has no
   * key) the plaintext goes as before.
   */
  private async wireContent(convId: ID, myAddress: string, text: string): Promise<string> {
    if (!text) return text;
    const peer = peerAddressForConversation(convId, myAddress);
    const wire = await prepareOutgoing(peer, text);
    return wire.content;
  }

  private async emitText(job: TextSendJob, convId: ID, txHash?: string, tipTxHash?: string): Promise<void> {
    const payload: Record<string, unknown> = {
      dmId: convId,
      content: await this.wireContent(convId, job.address, job.content),
      type: "msg",
    };
    if (job.replyTo) payload.replyTo = job.replyTo._id;
    if (job.forwardedFrom) payload.forwardedFrom = job.forwardedFrom;
    if (txHash) payload.txHash = txHash;
    if (tipTxHash) payload.tipTxHash = tipTxHash;

    this.ws!.emitAuthed(DMSocketEvent.SendMessage, payload);
    log.debug("emitText sent:", convId);
  }

  private async emitGif(job: GifSendJob, convId: ID, txHash?: string, tipTxHash?: string): Promise<void> {
    const payload: Record<string, unknown> = {
      dmId: convId,
      content: await this.wireContent(convId, job.address, job.caption || ""),
      type: "gif",
      gif: job.gifUrl,
    };
    if (job.replyTo) payload.replyTo = job.replyTo._id;
    if (txHash) payload.txHash = txHash;
    if (tipTxHash) payload.tipTxHash = tipTxHash;

    this.ws!.emitAuthed(DMSocketEvent.SendMessage, payload);
    log.debug("emitGif sent:", convId);
  }


  private async executeTip(job: TipSendJob, convId: ID): Promise<void> {
    if (!this.feePayer) throw new Error("Wallet not connected");

    log.debug("paying tip:", job.tipAmount, "DHB");
    const txHash = await withTimeout(this.feePayer(job.tipAmount), FEE_PAYMENT_TIMEOUT, "tip payment");
    log.debug("tip paid, txHash:", txHash);

    const token = supportedTokens.find((t) => t.symbol === "DHB");
    const chainIdVal = token?.chainId ?? 0;
    const tokenAddr = token?.address ?? "";

    await tipNotify({
      txHash,
      conversationId: convId as string,
      senderAddress: job.address,
      chainId: chainIdVal,
      tokenAddress: tokenAddr,
      amount: String(job.tipAmount),
    });
    log.debug("tipNotify sent:", convId, txHash);
  }


  private async uploadMedia(job: MediaSendJob, convId: ID, txHash?: string, tipTxHash?: string): Promise<void> {
    // Size check for videos only (images are pre-compressed by the picker)
    if (job.mediaType === "video") {
      try {
        const info = await FileSystem.getInfoAsync(job.uri);
        const size = (info as any)?.size as number | undefined;
        if (size && size > DM_VIDEO_MAX_SIZE) {
          throw new Error(
            `Video too large (${(size / 1024 / 1024).toFixed(1)} MB). Max: ${DM_VIDEO_MAX_SIZE / 1024 / 1024} MB.`,
          );
        }
      } catch (e: any) {
        if (e?.message?.includes("too large")) throw e;
      }
    }

    const isVoice = job.msgType === "voice";
    const ext = isVoice ? "m4a" : job.mediaType === "video" ? "mp4" : "jpg";
    const file = {
      uri: job.uri,
      // Documents keep the name the user picked — the server reads the
      // extension off it to decide whether the file is allowed at all.
      name: job.mediaType === "file"
        ? (job.fileName || "file")
        : `${Date.now()}.${ext}`,
      type: job.mimeType,
    };

    // Documents share the video budget: both are large and both go straight to
    // S3 without a transcode step.
    const timeout = job.mediaType === "image" ? UPLOAD_TIMEOUT_IMAGE : UPLOAD_TIMEOUT_VIDEO;

    // Only the caption is encrypted; the file itself goes to the CDN as-is.
    const wireCaption = await this.wireContent(convId, job.address, job.caption || "");
    const captionEncrypted = !!job.caption && wireCaption !== job.caption;

    const serverMsg = await withRetry(
      () =>
        withTimeout(
          uploadDmMedia({
            conversationId: convId,
            senderId: job.address,
            files: [file],
            msgType: job.msgType || "media",
            voiceDuration: job.voiceDuration,
            content: wireCaption || undefined,
            replyTo: job.replyTo?._id,
            txHash,
            tipTxHash,
          }),
          timeout,
          `${job.mediaType} upload`,
        ),
      MAX_UPLOAD_RETRIES,
      `${job.mediaType} upload`,
    );

    if (serverMsg?._id) {
      // Force isRead:false — receiver hasn't seen it yet. The echo carries the
      // caption as sent (ciphertext); the store must hold the plaintext.
      dmActions.upsertMessages(convId, [{
        ...serverMsg,
        ...(captionEncrypted ? { content: job.caption, encrypted: true } : {}),
        author: "me",
        isRead: false,
      }]);
    }
    log.debug("uploadMedia complete:", convId, serverMsg?._id);
  }


  private makeTempId(): string {
    this.counter += 1;
    return `temp-${Date.now()}-${this.counter}-${Math.random().toString(36).slice(2, 6)}`;
  }

  private buildOptimistic(params: {
    tempId: string;
    conversationId: ID;
    userId: string;
    content: string;
    msgType: DmMsgType;
    replyTo?: DmMessage | null;
    mediaUrls?: DmMediaUrl[];
    localMediaUri?: string;
    uploadStatus?: "pending" | "complete" | "failed";
    tipAmount?: number;
    paymentStatus?: "pending" | "confirmed" | null;
    voiceDuration?: number;
  }): OptimisticMessage {
    const replyPreview: ReplyPreview | undefined = params.replyTo
      ? {
          _id: params.replyTo._id,
          content: params.replyTo.content?.slice(0, 200) || "",
          msgType: (params.replyTo.msgType as DmMsgType) || "msg",
          mediaUrls: params.replyTo.mediaUrls?.slice(0, 1) || [],
          voiceDuration: params.replyTo.voiceDuration || null,
          sender:
            typeof params.replyTo.sender === "object"
              ? (params.replyTo.sender as any)
              : { _id: String(params.replyTo.sender) },
        }
      : undefined;

    return {
      _id: params.tempId,
      _optimistic: true,
      _tempId: params.tempId,
      _localMediaUri: params.localMediaUri,
      conversation: params.conversationId,
      sender: params.userId || "me",
      author: "me",
      content: params.content,
      msgType: params.msgType,
      mediaUrls: params.mediaUrls,
      replyTo: replyPreview,
      uploadStatus: params.uploadStatus,
      tipAmount: params.tipAmount ?? null,
      paymentStatus: params.paymentStatus ?? null,
      voiceDuration: params.voiceDuration,
      createdAt: new Date().toISOString(),
    };
  }
}

/** Singleton send queue — import and use throughout the app. */
export const dmSendQueue = new DmSendQueue();
