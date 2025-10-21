import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ScreenNames } from '../navigation/ScreenNames';
import ScreenHeader from '../components/ScreenHeader';
import { getNFT, type GetNFTsResult } from '../services/nft.service';
import FeedCard from '../components/Feed/FeedCard';
import CommentItem, { type Comment } from '../components/Feed/CommentItem';
import CommentInput, { type CommentInputRef } from '../components/Feed/CommentInput';
import CommentsSkeleton from '../components/Feed/CommentsSkeleton';
import FeedCardSkeleton from '../components/Feed/FeedCardSkeleton';
import { formatDistance } from 'date-fns';
import { getAvatarUrl } from '../libs';
import { useAuth } from '../context/AuthContext';
import useKeyboard from '../hooks/useKeyboard';
import { useUserProfileSheet } from '../context/UserProfileSheetContext';

// Card skeleton matching FeedCard structure
const CardSkeleton: React.FC = () => (
  <View className="px-4 pt-3">
    <FeedCardSkeleton count={1} />
  </View>
);

export default function FeedDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const tokenId: number | string | undefined = route?.params?.tokenId ?? route?.params?.id;
  const { user, requireAuth } = useAuth();
  const address = useMemo(() => user?.walletAddress || user?.address || undefined, [user?.walletAddress, user?.address]);

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<GetNFTsResult | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const inputRef = useRef<CommentInputRef>(null);
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();
  const { showUserProfile } = useUserProfileSheet();

  const fetchData = useCallback(async () => {
    if (tokenId == null) return;
    setLoading(true);
    try {
      const res: any = await getNFT(tokenId as any, address);
      const payload: any = res?.result || res || {};
      setItem(payload as GetNFTsResult);
      const rawComments: any[] = Array.isArray(payload?.comments) ? payload.comments : [];
      const replyIdSet = new Set<number>();
      rawComments.forEach((c: any) => Array.isArray(c?.replyIds) && c.replyIds.forEach((id: any) => replyIdSet.add(Number(id))));
      const byId = new Map<number, any>();
      rawComments.forEach((c) => byId.set(Number(c?.id), c));
      const topLevel = rawComments.filter((c) => !replyIdSet.has(Number(c?.id)));
      const flat: Comment[] = [];
      const toComment = (c: any, parentId?: number | string): Comment => {
        const u = c?.writor?.username || c?.address || '';
        const avatar = getAvatarUrl(c?.writor?.avatarUrl) || undefined;
        const text = String(c?.content || '').replace(/<[^>]+>/g, '');
        const created = c?.createdAt ? new Date(c.createdAt) : undefined;
        const time = created ? formatDistance(created, new Date(), { addSuffix: true }) : '';
        return { id: String(c?.id), user: u, avatarUri: avatar, text, time, replyToId: parentId };
      };
      topLevel.forEach((c) => {
        flat.push(toComment(c));
        if (Array.isArray(c?.replyIds)) {
          c.replyIds.forEach((rid: any) => {
            const rc = byId.get(Number(rid));
            if (rc) flat.push(toComment(rc, c?.id));
          });
        }
      });
      setComments(flat);
    } catch (e) {
      setItem(null);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [tokenId, address]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenImage = useCallback((images: any[], index: number) => {
    navigation.navigate(ScreenNames.ImageViewer, { images, index });
  }, [navigation]);

  const handleOpenComments = useCallback(() => {
    // No-op for detail; clicking chat icon should focus input instead
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleSend = useCallback((text: string) => {
    if (!text || tokenId == null) return;
    requireAuth?.(async () => {
      const tempId = `temp-${Date.now()}`;
      const temp: Comment = {
        id: tempId,
        user: user?.username || 'you',
        avatarUri: getAvatarUrl(user?.avatarImageUrl || user?.avatarUrl) || undefined,
        text,
        time: 'Just now',
        replyToId: replyTo?.id,
      };
      // Optimistic insert: after parent if reply else prepend
      setComments((prev) => {
        if (replyTo?.id) {
          const idx = prev.findIndex((c) => c.id === replyTo.id);
          if (idx >= 0) {
            const next = [...prev];
            next.splice(idx + 1, 0, temp);
            return next;
          }
        }
        return [temp, ...prev];
      });
      const replyTarget = replyTo;
      if (replyTarget) setReplyTo(null);
      try {
        const payload = { streamTokenId: tokenId as any, content: text, commentId: replyTarget?.id } as any;
        // Reuse postComment via services
        const res = await (await import('../services/nft.service')).postComment(payload);
        const newId = (res as any)?.result?.id ?? (res as any)?.id ?? undefined;
        if (newId != null) {
          setComments((prev) => prev.map((c) => (c.id === tempId ? { ...c, id: String(newId) } : c)));
          // Bump count for top-level only
          if (!replyTarget) {
            setItem((prev) => prev ? ({ ...(prev as any), commentCount: Math.max(0, ((prev as any).commentCount ?? 0) + 1) } as any) : prev);
          }
        }
      } catch (e) {
        // Revert
        setComments((prev) => prev.filter((c) => c.id !== tempId));
      }
    });
  }, [requireAuth, tokenId, replyTo, user?.username, user?.avatarImageUrl, user?.avatarUrl]);

  const renderHeader = useCallback(() => (
    <View>
      <ScreenHeader title="Feed" />
      {item ? (
        <View className="px-4">
          <FeedCard item={item} showFollow onOpenImage={handleOpenImage} onOpenComments={() => {
            requestAnimationFrame(() => inputRef.current?.focus());
          }} />
        </View>
      ) : loading ? (
        <CardSkeleton />
      ) : null}
      <View className="px-4 pt-2 pb-1">
        <Text className="text-theme-neutrals-400 text-xs">Comments</Text>
      </View>
    </View>
  ), [item, loading, handleOpenImage]);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <FlatList
        data={comments}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!loading ? (
          <View className="px-4 py-6">
            <Text className="text-theme-neutrals-400 text-sm">No comments yet, add yours.</Text>
          </View>
        ) : (
          // While loading and no comments yet, show comments skeleton area
          <View className="px-4 py-3">
            <CommentsSkeleton />
          </View>
        )}
        renderItem={({ item: c }) => (
          <View className="px-4" style={{ paddingLeft: c.replyToId ? 24 : 0 }}>
            <CommentItem comment={c} onUserPress={(id) => showUserProfile(id, { initialHeightPct: 0.4, source: 'comment' })} onReplyPress={(cm) => {
              setReplyTo(cm);
              requestAnimationFrame(() => inputRef.current?.focus());
            }} />
          </View>
        )}
        // Keep room for the input and keyboard
        contentContainerStyle={{ paddingBottom: (kbVisible ? kbHeight : 0) + 76 }}
        keyboardShouldPersistTaps="handled"
      />
      <View className="border-t border-theme-neutrals-800" style={{ paddingBottom: kbVisible ? kbHeight : 0 }}>
        <CommentInput
          ref={inputRef}
          onSend={handleSend}
          placeholder={replyTo ? 'Replying…' : undefined}
          autoFocus={false}
          replyToLabel={replyTo?.user}
          onCancelReply={() => setReplyTo(null)}
        />
      </View>
    </View>
  );
}
