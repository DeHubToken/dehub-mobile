import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import type { GenerationDraft } from '../../libs/editor/generationDraft';
import { EMPTY_MARKETING_BRIEF, MARKETING_FIELDS, MARKETING_FORMATS, marketingFieldLimit, marketingGenerationDraft, normalizeMarketingBrief, type MarketingBrief, type MarketingField } from '../../libs/marketingBrief';
import { MarketingProductImport } from './MarketingProductImport';
import { CampaignPlanPanel } from './CampaignPlanPanel';

export function MarketingWorkspace({ onPrepare }: { onPrepare: (draft: GenerationDraft) => void }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useSurfaceDraft<MarketingBrief>('creator.marketingBrief.v1', EMPTY_MARKETING_BRIEF, 'campaign');
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState(false);
  const brief = normalizeMarketingBrief(saved);
  const ready = Boolean(brief.product.trim() && brief.description.trim());
  const update = (field: MarketingField, value: string) => { setSaved({ ...brief, [field]: value }); setPreview(false); };
  return <View className="mx-4 my-5 rounded-3xl border border-theme-neutrals-700 bg-theme-neutrals-800 p-4">
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}>
      <Text className="text-xl font-bold text-theme-neutrals-100">{t('creator.marketing.title')}</Text>
      <Text className="mt-2 text-sm text-theme-neutrals-400">{t('creator.marketing.intro')}</Text>
    </Pressable>
    {expanded && <>
      <Text className="mt-2 text-xs text-theme-neutrals-400">{t('creator.marketing.saved')}</Text>
      <MarketingProductImport onUse={(product, sourceUrl) => { setSaved(normalizeMarketingBrief({ ...brief, product: product.name, description: product.description, brand: product.brand || brief.brand, sourceUrl })); setPreview(false); }} />
      {brief.sourceUrl ? <Text selectable className="mt-3 text-xs text-theme-neutrals-400">{t('creator.marketing.import.source')}: {brief.sourceUrl}</Text> : null}
      {MARKETING_FIELDS.map((field) => <View key={field} className="mt-4">
        <Text nativeID={`marketing-${field}`} className="mb-1.5 text-sm font-medium text-theme-neutrals-100">{t(`creator.marketing.fields.${field}`)}</Text>
        <TextInput accessibilityLabel={t(`creator.marketing.fields.${field}`)} accessibilityLabelledBy={`marketing-${field}`} value={brief[field]} onChangeText={(value) => update(field, value)} multiline maxLength={marketingFieldLimit(field)}
          textAlignVertical="top" className="min-h-[64px] rounded-xl border border-theme-neutrals-700 p-3 text-sm text-theme-neutrals-100" />
      </View>)}
      <View className="mt-4 flex-row flex-wrap gap-3">
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={() => setPreview(true)} className="rounded-xl border border-theme-neutrals-400 px-4 py-3" style={{ opacity: ready ? 1 : 0.4 }}><Text className="font-semibold text-theme-neutrals-100">{t('creator.marketing.preview')}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setSaved(EMPTY_MARKETING_BRIEF); setSaved.clear(); setPreview(false); }} className="px-3 py-3"><Text className="text-theme-neutrals-300 underline">{t('creator.marketing.clear')}</Text></Pressable>
      </View>
      {!ready && <Text className="mt-3 text-xs text-theme-neutrals-400">{t('creator.marketing.required')}</Text>}
      {preview && ready && <View className="mt-5" accessibilityLiveRegion="polite">
        <Text className="font-semibold text-theme-neutrals-100">{t('creator.marketing.variants')}</Text>
        <Text className="mt-1 text-xs text-theme-neutrals-400">{t('creator.marketing.reviewHint')}</Text>
        {MARKETING_FORMATS.map((format) => <View key={format.id} className="mt-3 rounded-2xl border border-theme-neutrals-700 p-4">
          <Text className="font-semibold text-theme-neutrals-100">{t(`creator.marketing.formats.${format.id}`)}</Text>
          <Text className="text-xs text-theme-neutrals-400">{format.aspect}</Text>
          <Text className="mt-3 text-sm font-medium text-theme-neutrals-100">{brief.headline.trim() || brief.product.trim()}</Text>
          {brief.benefit.trim() ? <Text className="mt-1 text-xs text-theme-neutrals-300">{brief.benefit.trim()}</Text> : null}
          {brief.cta.trim() ? <Text className="mt-2 text-xs font-semibold text-theme-neutrals-100">{brief.cta.trim()}</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => { const draft = marketingGenerationDraft(brief, format.id); if (draft) onPrepare(draft); }} className="mt-4 rounded-xl border border-theme-neutrals-400 px-3 py-3"><Text className="text-theme-neutrals-100">{t('creator.marketing.open')}</Text></Pressable>
        </View>)}
      </View>}
      <CampaignPlanPanel brief={brief} onPrepare={onPrepare} />
    </>}
  </View>;
}
