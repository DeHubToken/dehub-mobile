import React from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import SmartImage from '../common/SmartImage';
import { MABOROSHI_ART, MABOROSHI_LOOKS } from '../../libs/maboroshiLooks';

export default function MaboroshiShowcase({ onOpen }: { onOpen: (preset?: string) => void }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const size = Math.min(300, Math.round((width - 32) * 0.78));
  return (
    <View className="pb-7 pt-2">
      <View className="px-4">
        <Text className="mb-2 text-sm font-semibold text-theme-neutrals-400">{t('creator.toolMaboroshi')}</Text>
        <Text accessibilityRole="header" className="text-[30px] font-black leading-[33px] text-theme-neutrals-100">{t('maboroshiShowcase.title')}</Text>
        <Text className="mt-3 text-sm leading-5 text-theme-neutrals-400">{t('maboroshiShowcase.intro')}</Text>
        <Pressable onPress={() => onOpen()} accessibilityRole="button" className="min-h-11 justify-center py-3">
          <Text className="text-sm font-semibold text-theme-neutrals-100 underline">{t('maboroshiShowcase.browse')}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={size + 12} decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} accessibilityLabel={t('creator.toolMaboroshi')}>
        {MABOROSHI_LOOKS.map(look => {
          const name = t(`maboroshiShowcase.${look.key}`);
          return <Pressable key={look.id} onPress={() => onOpen(look.id)} accessibilityRole="button"
            accessibilityLabel={t('maboroshiShowcase.choose', { name })} style={{ width: size }}>
            <View style={{ width: size, height: size, overflow: 'hidden', borderRadius: 16 }} className="bg-theme-neutrals-800">
              <SmartImage source={{ uri: MABOROSHI_ART }} recyclingKey={look.id} contentFit="fill"
                style={{ position: 'absolute', width: size * 3, height: size * 2, left: -look.column * size, top: -look.row * size }} />
            </View>
            <Text className="py-3 text-base font-semibold text-theme-neutrals-100">{name}</Text>
          </Pressable>;
        })}
      </ScrollView>
      <Text className="mt-2 px-4 text-xs leading-5 text-theme-neutrals-400">{t('maboroshiShowcase.inspiration')}</Text>
    </View>
  );
}
