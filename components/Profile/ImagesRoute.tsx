import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Text, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import ProfileImageGrid from "./ProfileImageGrid";
import { getUnifiedFeed, type UnifiedFeedItem } from "../../services/feed.unified.service";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";

interface ImagesRouteProps {
  address?: string;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

const ImagesRoute: React.FC<ImagesRouteProps> = ({ address, onScroll }) => {
  const [images, setImages] = useState<UnifiedFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(1);
  const endRef = useRef(false);
  const navigation = useNavigation<any>();

  const fetchImages = useCallback(async (page: number) => {
    if (!address) return;
    try {
      const res = await getUnifiedFeed({
        minter: address,
        postType: "feed-images",
        sortBy: "createdAt",
        sortOrder: "desc",
        status: "minted",
        page,
        limit: 21,
      });
      if (page === 1) {
        setImages(res.result || []);
      } else {
        setImages((prev) => [...prev, ...(res.result || [])]);
      }
      if (!res.result || res.result.length < 21 || !res.pagination?.hasMore) {
        endRef.current = true;
      }
    } catch (e: any) {
      if (page === 1) setError(e?.message || "Failed to load");
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    setError(null);
    pageRef.current = 1;
    endRef.current = false;
    fetchImages(1).finally(() => setLoading(false));
  }, [address, fetchImages]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || endRef.current || loading) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    pageRef.current = nextPage;
    await fetchImages(nextPage);
    setLoadingMore(false);
  }, [loadingMore, loading, fetchImages]);

  const handleImagePress = useCallback(
    (index: number) => {
      navigation.navigate(ScreenNames.ImageFeed, {
        initialIndex: index,
        initialItems: images,
        feedParams: { minter: address, postType: "feed-images", sortBy: "createdAt", sortOrder: "desc" },
      });
    },
    [images, navigation, address],
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
        <Text style={{ color: "#a1a1aa", marginBottom: 8 }}>{error}</Text>
      </View>
    );
  }

  if (images.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
        <Text style={{ color: "#71717a", fontSize: 14 }}>No images yet</Text>
        <Text style={{ color: "#52525b", fontSize: 12, marginTop: 4 }}>Image posts will appear here</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ProfileImageGrid images={images} onImagePress={handleImagePress} onScroll={onScroll} />
      {loadingMore && (
        <View style={{ alignItems: "center", paddingVertical: 16 }}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
    </View>
  );
};

export default ImagesRoute;
