import React, { useCallback, useState, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList } from 'react-native';

interface GiftItem {
  id: string;
  name: string;
  cost: number; // coins
  emoji: string;
  featured?: boolean;
}

interface GiftModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (gift: GiftItem, quantity: number) => void;
  balance?: number;
}

const GIFT_CATALOG: GiftItem[] = [
  { id: 'rose', name: 'Rose', cost: 1, emoji: '🌹' },
  { id: 'like', name: 'Like', cost: 2, emoji: '👍', featured: true },
  { id: 'diamond', name: 'Diamond', cost: 50, emoji: '💎', featured: true },
  { id: 'rocket', name: 'Rocket', cost: 120, emoji: '🚀' },
  { id: 'fire', name: 'Fire', cost: 15, emoji: '🔥' },
  { id: 'crown', name: 'Crown', cost: 300, emoji: '👑' },
  { id: 'gift', name: 'Gift Box', cost: 25, emoji: '🎁' },
  { id: 'music', name: 'Music', cost: 40, emoji: '🎵' },
];

const GiftModal: React.FC<GiftModalProps> = ({ visible, onClose, onSend, balance = 500 }) => {
  const [selected, setSelected] = useState<GiftItem | null>(null);
  const [quantity, setQuantity] = useState<number>(1);

  const totalCost = useMemo(() => (selected ? selected.cost * quantity : 0), [selected, quantity]);

  const renderItem = useCallback(({ item }: { item: GiftItem }) => {
    const isSelected = selected?.id === item.id;
    return (
      <TouchableOpacity
        onPress={() => setSelected(item)}
        className={[ 'w-[30.5%] h-24 m-1 rounded-xl border items-center justify-center',
          isSelected ? 'bg-white/10 border-white/60' : 'bg-white/5 border-white/10'
        ].join(' ')}
        activeOpacity={0.8}
      >
        <Text className="text-2xl mb-1">{item.emoji}</Text>
        <Text className="text-white text-[11px] font-medium" numberOfLines={1}>{item.name}</Text>
        <Text className="text-amber-300 text-[10px] mt-0.5">{item.cost}c</Text>
      </TouchableOpacity>
    );
  }, [selected]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/70 justify-end">
        <View className="bg-zinc-900 rounded-t-2xl p-4 max-h-[75%]">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-white font-semibold text-base">Send a Gift</Text>
            <TouchableOpacity onPress={onClose} className="px-2 py-1">
              <Text className="text-white/60">Close</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-white/60 text-xs mb-3">Balance: <Text className="text-amber-300 font-semibold">{balance} coins</Text></Text>
          <FlatList
            data={GIFT_CATALOG}
            keyExtractor={(g) => g.id}
            renderItem={renderItem}
            numColumns={3}
            className=""
            contentContainerStyle={{ paddingBottom: 12 }}
          />
          {selected && (
            <View className="mt-2">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-white text-sm">{selected.emoji} {selected.name}</Text>
                <Text className="text-amber-300 text-xs">{selected.cost} each</Text>
              </View>
              <View className="flex-row items-center mb-3">
                <TouchableOpacity
                  disabled={quantity <= 1}
                  onPress={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-full bg-white/10 items-center justify-center mr-2"
                >
                  <Text className="text-white text-lg">-</Text>
                </TouchableOpacity>
                <View className="px-4 py-2 rounded-lg bg-white/10">
                  <Text className="text-white font-semibold">{quantity}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setQuantity(q => Math.min(999, q + 1))}
                  className="w-9 h-9 rounded-full bg-white/10 items-center justify-center ml-2"
                >
                  <Text className="text-white text-lg">+</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={!selected}
                  onPress={() => { if (selected) { onSend(selected, quantity); setQuantity(1); setSelected(null); }}}
                  className="flex-1 h-10 ml-3 rounded-xl items-center justify-center bg-amber-500/90"
                >
                  <Text className="text-white font-semibold">Send {totalCost > 0 ? `(${totalCost}c)` : ''}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

export default GiftModal;
