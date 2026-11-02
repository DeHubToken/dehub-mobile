/**
 * A pay-to-unlock photo or video in a DM.
 *
 * The other person sees the server's blurred preview with the price and an
 * Unlock button (on iPhone: "Unlock on dehub.io", since paid digital content
 * inside an iOS app has to go through Apple). Paying tips the sender; the
 * server checks it and hands back a signed link to the real file. The sender
 * sees their own photo with its price and whether it has been unlocked.
 *
 * The real file only ever comes from GET /dm/locked/:id, never from the
 * message itself.
 */
import React, { memo, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import SmartImage from "../common/SmartImage";
import Icon from "../ui/Icon";
import { toastError, toastSuccess } from "../../libs/toast";
import { useWebSocketApi } from "../../context/WebSocketContext";
import { DMSocketEvent } from "../../services/enums/dm-socket-events.enum";
import { getLockedMedia, unlockLockedMedia } from "../../services/dm/dm.api";
import type { DmLockStatus, DmMessage } from "../../services/dm/dm.types";
import { LOCKED_MEDIA_WEB_URL, lockedMediaKey, lockedMediaUri, payForLockedMedia } from "../../libs/dmLocked";

/** Set inline too: rounded-full alongside dark-surface can drop the radius. */
const ROUND = { borderRadius: 999 } as const;

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

interface LockedMediaProps {
  message: DmMessage;
  isMine: boolean;
  width: number;
  onImagePress?: (url: string) => void;
  onVideoPress?: (url: string) => void;
  onLongPress?: () => void;
  /** Gallery / preview only: skip the socket. */
  offline?: boolean;
}

function LockedMediaInner({ message, isMine, width, onImagePress, onVideoPress, onLongPress, offline }: LockedMediaProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ws = useWebSocketApi();
  const lock = message.lock!;
  const isTemp = String(message._id).startsWith("temp-");
  const [paying, setPaying] = useState(false);
  const isIos = Platform.OS === "ios";

  const { data: status } = useQuery<DmLockStatus>({
    queryKey: lockedMediaKey(String(message._id)),
    queryFn: () => getLockedMedia(message._id),
    enabled: !isTemp && lock.ready !== false && !offline,
    staleTime: 30 * 60_000,
    refetchInterval: (q) => (q.state.data?.pendingTxHash ? 4000 : false),
  });

  useEffect(() => {
    if (offline || !ws) return undefined;
    return ws.on(DMSocketEvent.DmMediaUnlocked, (data: { messageId?: string; amount?: number }) => {
      if (data?.messageId !== String(message._id)) return;
      void queryClient.invalidateQueries({ queryKey: lockedMediaKey(String(message._id)) });
      if (isMine) {
        toastSuccess(t("dmPaidLock.unlockedByThem", {
          defaultValue: "Your locked {{kind}} was unlocked: +{{amount}} DHB",
          kind: lock.kind === "video" ? "video" : "photo",
          amount: fmt(Number(data.amount || lock.price)),
        }));
      }
    });
  }, [ws, offline, message._id, isMine, lock.kind, lock.price, queryClient, t]);

  const view = status?.lock ?? lock;
  const realUrl = lockedMediaUri(view.mediaUrl || (isMine ? lock.mediaUrl : undefined));
  const pending = !!status?.pendingTxHash || paying;
  const previewUri = lockedMediaUri(view.previewUrl || message.mediaUrls?.[0]?.url);
  const priceLabel = `${fmt(lock.price)} ${lock.symbol || "DHB"}`;
  const height = Math.round(width * 1.25);

  const handleUnlock = async () => {
    if (paying) return;
    if (isIos) {
      void Linking.openURL(LOCKED_MEDIA_WEB_URL);
      return;
    }
    if (!status) return;
    setPaying(true);
    try {
      const txHash = await payForLockedMedia(lock.price);
      const res = await unlockLockedMedia(message._id, txHash);
      queryClient.setQueryData(lockedMediaKey(String(message._id)), res);
      if (res.status === "unlocked") toastSuccess(t("dmPaidLock.unlocked", "Unlocked"));
      else toastSuccess(t("dmPaidLock.stillConfirming", "Payment sent. It opens as soon as it confirms."));
    } catch (e: any) {
      toastError(e?.message || t("dmPaidLock.payFailed", "Could not unlock"));
    } finally {
      setPaying(false);
    }
  };

  // ── Sender, or someone who has paid: the real thing ──
  if (realUrl) {
    const isVideo = lock.kind === "video";
    const sold = (view.unlockCount ?? 0) > 0;
    return (
      <View>
        <Pressable
          onPress={() => (isVideo ? onVideoPress?.(realUrl) : onImagePress?.(realUrl))}
          onLongPress={onLongPress}
          delayLongPress={350}
          style={{ width, height: isVideo ? Math.round(width * 0.75) : height }}
          className="bg-theme-neutrals-700"
        >
          {isVideo ? (
            <View className="flex-1 items-center justify-center dark-surface bg-black">
              <View style={ROUND} className="w-12 h-12 rounded-full items-center justify-center dark-surface bg-black/50">
                <Icon name="Play" size={22} color="#fff" />
              </View>
            </View>
          ) : (
            <SmartImage source={{ uri: realUrl }} recyclingKey={realUrl} style={{ width, height }} contentFit="cover" />
          )}
          <View style={ROUND} className="absolute top-1.5 left-1.5 flex-row items-center gap-1 rounded-full px-2 py-0.5 dark-surface bg-black/60">
            <Icon name={isMine ? "Lock" : "LockOpen"} size={11} color="#fff" />
            <Text className="text-[11px] font-semibold text-white">{priceLabel}</Text>
            {isMine && sold ? (
              <Text className="text-[11px] text-white">{"  ✓ " + t("dmPaidLock.unlockedTag", "Unlocked")}</Text>
            ) : null}
          </View>
        </Pressable>
        {isMine && !sold ? (
          <Text className="text-[11px] px-2 py-1 text-white/60">{t("dmPaidLock.notYet", "Not unlocked yet")}</Text>
        ) : null}
      </View>
    );
  }

  // ── Sender's own upload still processing ──
  if (isMine) {
    return (
      <View style={{ width, height: 120 }} className="items-center justify-center dark-surface bg-black/40">
        <ActivityIndicator color="#fff" size="small" />
        <Text className="text-[11px] text-white/80 mt-1">{t("dmPaidLock.uploading", "Locking…")}</Text>
      </View>
    );
  }

  // ── Recipient, not paid yet: blur + price + Unlock ──
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350} style={{ width, height }} className="dark-surface bg-zinc-900 overflow-hidden">
      {previewUri ? (
        <SmartImage source={{ uri: previewUri }} recyclingKey={previewUri} style={{ position: "absolute", width, height }} contentFit="cover" />
      ) : null}
      <View className="absolute inset-0 dark-surface bg-black/35" />
      <View className="absolute inset-0 items-center justify-center px-4">
        <View style={ROUND} className="w-11 h-11 rounded-full items-center justify-center dark-surface bg-white/15">
          <Icon name={lock.kind === "video" ? "Play" : "Lock"} size={20} color="#fff" />
        </View>
        <Text className="text-[12px] font-medium text-white/80 mt-2">
          {lock.kind === "video" ? t("dmPaidLock.lockedVideo", "Locked video") : t("dmPaidLock.lockedPhoto", "Locked photo")}
        </Text>
        <Pressable
          onPress={handleUnlock}
          disabled={pending || (!isIos && !status)}
          accessibilityRole="button"
          style={ROUND}
          className="mt-3 flex-row items-center gap-1.5 rounded-full px-4 py-2 dark-surface bg-black/60 border border-white/30"
        >
          {pending ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="LockOpen" size={15} color="#fff" />}
          <Text className="text-[14px] font-semibold text-white">
            {pending
              ? t("dmPaidLock.confirming", "Confirming payment…")
              : isIos
                ? t("dmPaidLock.unlockOnWeb", { defaultValue: "Unlock on dehub.io · {{price}}", price: priceLabel })
                : t("dmPaidLock.unlockFor", { defaultValue: "Unlock for {{price}}", price: priceLabel })}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const LockedMedia = memo(LockedMediaInner);
export default LockedMedia;
