import React, { useEffect, useState } from "react";
import { View, StatusBar, Platform, ActivityIndicator } from "react-native";
import { useRoute } from "@react-navigation/native";
import LiveStreamPlayer from "../components/VideoPlayer/LiveStreamPlayer";
import { useDarkSurface } from "../context/ThemeContext";

type RouteParams = {
  tokenId?: string | number;
  streamKey?: string;
  streamId?: string;
  playbackId?: string;
  nft?: any;
  accessInfo?: any;
};

// Stream ids are Mongo ObjectIds. A post's tokenId is a small number, and
// handing one to the stream API reads as "Stream Offline".
const isStreamId = (id: unknown): id is string =>
  typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);

/**
 * LiveViewerScreen – immersive fullscreen wrapper around LiveStreamPlayer.
 *
 * All join/leave socket logic lives exclusively inside LiveStreamPlayer so
 * there is exactly one source of truth and no duplicate emissions.
 */
const LiveViewerScreen: React.FC = () => {
  const route = useRoute<any>();
  const params = (route.params || {}) as RouteParams;
  // Live is a dark room in every theme. Until System Light has handed over to
  // System, paint only the black well: a player drawn under the light tone
  // would keep those colours.
  const dark = useDarkSurface();

  // Resolve the real stream ID from multiple possible sources
  const known = [
    params.streamId,
    (params.nft as any)?.stream?._id,
    (params.nft as any)?.stream?.id,
    (params.nft as any)?._id,
  ].find(isStreamId) ?? null;

  // Notifications and pushes only carry the post. Look its stream up.
  const lookupToken =
    known ? null : params.tokenId ?? (params.streamId && /^\d+$/.test(params.streamId) ? params.streamId : null);
  const [resolved, setResolved] = useState<{ token: string; streamId: string | null; nft: any } | null>(null);
  useEffect(() => {
    if (lookupToken == null) return;
    let cancelled = false;
    // Required lazily, like libs/openLiveTarget, so this screen does not pull
    // the API client in under tests.
    const { getNFT } = require("../services/nft.service");
    getNFT(lookupToken)
      .then((res: any) => {
        if (cancelled) return;
        const nft = res?.result;
        const id = [nft?.stream?._id, nft?.stream?.id].find(isStreamId) ?? null;
        setResolved({ token: String(lookupToken), streamId: id, nft });
      })
      .catch(() => {
        if (!cancelled) setResolved({ token: String(lookupToken), streamId: null, nft: null });
      });
    return () => {
      cancelled = true;
    };
  }, [lookupToken]);

  const looked = lookupToken != null && resolved?.token === String(lookupToken) ? resolved : null;
  const waiting = lookupToken != null && !looked;
  const streamId = known ?? looked?.streamId ?? null;
  const tokenId = params.tokenId ?? (looked ? Number(looked.token) : undefined);
  const nft = params.nft ?? looked?.nft ?? undefined;

  return (
    <View className="flex-1 dark-surface bg-black">
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={Platform.OS === "android"}
      />
      {waiting ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#fff" />
        </View>
      ) : dark ? (
        <LiveStreamPlayer
          key={streamId ?? params.streamId ?? tokenId}
          {...params}
          tokenId={tokenId}
          nft={nft}
          streamId={streamId ?? params.streamId}
        />
      ) : null}
    </View>
  );
};

export default LiveViewerScreen;
