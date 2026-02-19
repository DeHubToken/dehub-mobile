import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, type ListRenderItemInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlassModal from '../ui/GlassModal';
import Avatar from '../common/Avatar';
import ConfirmBlockModal from '../common/ConfirmBlockModal';
import { getBlockList, unblockUser, type BlockListItem } from '../../services/block.service';
import { getAvatarUrl } from '../../libs/misc';
import { truncateAddress } from '../../libs/strings.util';
import { toastSuccess, toastError } from '../../libs';

export type BlockedAccountsModalProps = {
  visible: boolean;
  onClose: () => void;
};

const ITEMS_PER_PAGE = 20;

const BlockedAccountsModal: React.FC<BlockedAccountsModalProps> = ({ visible, onClose }) => {
  const [items, setItems] = useState<BlockListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Unblock confirmation
  const [unblockTarget, setUnblockTarget] = useState<BlockListItem | null>(null);
  const [unblockLoading, setUnblockLoading] = useState(false);

  const fetchBlocked = useCallback(async (pageNum: number, append = false) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await getBlockList(pageNum, ITEMS_PER_PAGE);
      const newItems = res?.items || [];
      if (append) {
        setItems(prev => [...prev, ...newItems]);
      } else {
        setItems(newItems);
      }
      setHasMore(pageNum < (res?.pages || 1));
      setPage(pageNum);
    } catch (e) {
      console.error('[BlockedAccountsModal] fetch error', e);
      toastError('Failed to load blocked accounts');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Fetch on open
  useEffect(() => {
    if (visible) {
      fetchBlocked(1);
    } else {
      setItems([]);
      setPage(1);
      setHasMore(false);
    }
  }, [visible, fetchBlocked]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    fetchBlocked(page + 1, true);
  }, [hasMore, loadingMore, page, fetchBlocked]);

  const handleUnblockPress = useCallback((item: BlockListItem) => {
    setUnblockTarget(item);
  }, []);

  const handleConfirmUnblock = useCallback(async () => {
    if (!unblockTarget) return;
    setUnblockLoading(true);
    try {
      await unblockUser(unblockTarget.address);
      // Remove from local list
      setItems(prev => prev.filter(i => i.address !== unblockTarget.address));
      toastSuccess(`Unblocked ${unblockTarget.displayName || unblockTarget.username || truncateAddress(unblockTarget.address, 4, 4)}`);
    } catch (e) {
      console.error('[BlockedAccountsModal] unblock error', e);
      toastError('Failed to unblock user');
    } finally {
      setUnblockLoading(false);
      setUnblockTarget(null);
    }
  }, [unblockTarget]);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<BlockListItem>) => {
    const avatar = getAvatarUrl(item.avatarImageUrl || '');
    const label = item.displayName || item.username || truncateAddress(item.address, 5, 5);

    return (
      <View className="px-4 py-3 border-b border-theme-neutrals-800 flex-row items-center">
        <Avatar
          uri={avatar && avatar !== 'default-avatar' ? avatar : undefined}
          size={36}
          className="mr-3"
        />
        <View className="flex-1 min-w-0 mr-3">
          <Text className="text-white text-sm font-medium" numberOfLines={1}>{label}</Text>
          {item.username && (
            <Text className="text-theme-neutrals-400 text-[11px] mt-0.5" numberOfLines={1}>@{item.username}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => handleUnblockPress(item)}
          activeOpacity={0.8}
          className="bg-theme-neutrals-800 border border-theme-neutrals-700 px-3 py-1.5 rounded-full"
        >
          <Text className="text-red-400 text-xs font-semibold">Unblock</Text>
        </TouchableOpacity>
      </View>
    );
  }, [handleUnblockPress]);

  const keyExtractor = useCallback((item: BlockListItem) => item.blockId || item.address, []);

  return (
    <>
      <GlassModal visible={visible} onClose={onClose} presentation="center" maxHeight="75%" blurIntensity={30}>
        <View className="p-4">
          <Text className="text-white font-semibold text-lg">Blocked Accounts</Text>
          <Text className="text-theme-neutrals-400 text-xs mt-1">
            Users you have blocked won't appear in your feeds or be able to message you.
          </Text>

          <View className="mt-4 bg-theme-neutrals-900 rounded-xl border border-theme-neutrals-800 overflow-hidden" style={{ maxHeight: 400 }}>
            {loading ? (
              <View className="px-4 py-8 items-center justify-center">
                <ActivityIndicator size="small" color="#9CA3AF" />
              </View>
            ) : items.length === 0 ? (
              <View className="px-4 py-8 items-center justify-center">
                <Ionicons name="checkmark-circle-outline" size={32} color="#4B5563" />
                <Text className="text-theme-neutrals-400 text-sm mt-2">You haven't blocked anyone.</Text>
              </View>
            ) : (
              <FlatList
                data={items}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  loadingMore ? (
                    <View className="py-3 items-center">
                      <ActivityIndicator size="small" color="#9CA3AF" />
                    </View>
                  ) : null
                }
              />
            )}
          </View>

          <View className="mt-4 flex-row justify-end">
            <TouchableOpacity onPress={onClose} className="px-4 h-11 rounded-xl bg-theme-neutrals-700 items-center justify-center active:opacity-80">
              <Text className="text-theme-neutrals-100">Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GlassModal>

      <ConfirmBlockModal
        visible={!!unblockTarget}
        mode="unblock"
        targetLabel={unblockTarget?.displayName || unblockTarget?.username || 'user'}
        onConfirm={handleConfirmUnblock}
        onCancel={() => setUnblockTarget(null)}
        loading={unblockLoading}
      />
    </>
  );
};

export default BlockedAccountsModal;
