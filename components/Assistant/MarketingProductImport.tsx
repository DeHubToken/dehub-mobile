import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../context/AuthContext';
import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import { dehubAuthHeaders } from '../../services/ai.service';
import { useProductImporter, type ImportedProduct } from '../../libs/marketingProductImport';

export function MarketingProductImport({ onUse }: { onUse: (product: ImportedProduct, sourceUrl: string) => void }) {
  const { t } = useTranslation();
  const user = useUser();
  const owner = user?.walletAddress || user?.address || null;
  const [url, setUrl] = useSurfaceDraft('creator.marketingProductUrl.v1', '', 'campaign');
  const importer = useProductImporter(owner, async () => (await dehubAuthHeaders(owner))['x-dehub-token'] || '');
  return <View className="mt-5 rounded-2xl border border-theme-neutrals-700 p-4">
    <Text className="text-sm font-medium text-theme-neutrals-100">{t('creator.marketing.import.url')}</Text>
    <TextInput accessibilityLabel={t('creator.marketing.import.url')} keyboardType="url" autoCapitalize="none" autoCorrect={false} maxLength={4096} value={url} onChangeText={setUrl} className="mt-2 rounded-xl border border-theme-neutrals-700 p-3 text-sm text-theme-neutrals-100" />
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !url.trim() || importer.loading }} disabled={!url.trim() || importer.loading} onPress={() => void importer.run(url)} className="mt-3 rounded-xl border border-theme-neutrals-400 px-4 py-3" style={{ opacity: !url.trim() || importer.loading ? 0.4 : 1 }}><Text className="text-theme-neutrals-100">{t(importer.loading ? 'creator.marketing.import.loading' : 'creator.marketing.import.action')}</Text></Pressable>
    <Text className="mt-2 text-xs text-theme-neutrals-400">{t('creator.marketing.import.hint')}</Text>
    {importer.issue && <Text accessibilityRole="alert" className="mt-3 text-sm text-theme-neutrals-100">{t(`creator.marketing.import.errors.${importer.issue}`)}</Text>}
    {importer.result && <View className="mt-4" accessibilityLiveRegion="polite">
      <Text selectable className="text-xs text-theme-neutrals-400">{t('creator.marketing.import.source')}: {importer.result.finalUrl}</Text>
      <Text className="mt-1 text-xs text-theme-neutrals-400">{t('creator.marketing.import.review')}</Text>
      {importer.result.products.map((product, index) => <View key={index} className="mt-3 rounded-xl border border-theme-neutrals-700 p-3">
        <Text className="font-semibold text-theme-neutrals-100">{product.name}</Text>
        <Text className="mt-1 text-sm text-theme-neutrals-300">{product.description}</Text>
        {product.brand ? <Text className="mt-1 text-xs text-theme-neutrals-400">{product.brand}</Text> : null}
        <Pressable accessibilityRole="button" className="mt-3 rounded-xl border border-theme-neutrals-400 px-3 py-3" onPress={() => onUse(product, importer.result!.finalUrl)}><Text className="text-theme-neutrals-100">{t('creator.marketing.import.use')}</Text></Pressable>
      </View>)}
    </View>}
  </View>;
}
