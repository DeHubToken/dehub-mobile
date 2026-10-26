import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import { CAMPAIGN_VARIANT_FIELDS, CAMPAIGN_VARIANT_LIMIT, EMPTY_CAMPAIGN_PLAN, campaignFieldLimit, campaignVariantDraft, normalizeCampaignPlan, type CampaignPlan, type CampaignVariant, type CampaignVariantField } from '../../libs/campaignPlan';
import { MARKETING_FORMATS, type MarketingBrief } from '../../libs/marketingBrief';
import type { GenerationDraft } from '../../libs/editor/generationDraft';

const labels: Record<CampaignVariantField, string> = { title: 'creator.campaignVariantTitle', hook: 'creator.campaignHook', language: 'creator.campaignLanguage', script: 'creator.campaignScript', headline: 'creator.marketing.fields.headline', cta: 'creator.marketing.fields.cta' };
export function CampaignPlanPanel({ brief, onPrepare }: { brief: MarketingBrief; onPrepare: (draft: GenerationDraft) => void }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useSurfaceDraft<CampaignPlan>('creator.campaignPlan.v1', EMPTY_CAMPAIGN_PLAN, 'campaign');
  const plan = normalizeCampaignPlan(saved);
  const update = (id: string, patch: Partial<CampaignVariant>) => setSaved({ ...plan, variants: plan.variants.map(item => item.id === id ? { ...item, ...patch } : item) });
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} className="rounded-xl border border-theme-neutrals-500 px-3 py-3" style={{ opacity: disabled ? 0.4 : 1 }}><Text className="text-sm text-theme-neutrals-100">{label}</Text></Pressable>;
  const field = (label: string, value: string, limit: number, change: (value: string) => void, lines = 2) => <View className="mt-3"><Text className="mb-1 text-sm text-theme-neutrals-100">{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={change} multiline maxLength={limit} numberOfLines={lines} textAlignVertical="top" className="min-h-[64px] rounded-xl border border-theme-neutrals-700 p-3 text-sm text-theme-neutrals-100" /></View>;
  return <View className="mt-6 border-t border-theme-neutrals-700 pt-5">
    <Text className="font-semibold text-theme-neutrals-100">{t('creator.campaignPlanTitle')}</Text>
    <Text className="mt-2 text-xs text-theme-neutrals-400">{t('creator.campaignPlanIntro')}</Text>
    {field(t('creator.campaignTitle'), plan.title, 180, title => setSaved({ ...plan, title }))}
    {field(t('creator.campaignContinuity'), plan.continuity, 500, continuity => setSaved({ ...plan, continuity }), 3)}
    <View className="my-4 flex-row flex-wrap gap-3">
      {button(t('creator.campaignAdd'), () => setSaved({ ...plan, variants: [...plan.variants, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, format: 'square', title: '', hook: '', language: '', headline: '', cta: '', script: '' }] }), plan.variants.length >= CAMPAIGN_VARIANT_LIMIT)}
      {button(t('creator.campaignClear'), () => { setSaved(EMPTY_CAMPAIGN_PLAN); setSaved.clear(); })}
    </View>
    {plan.variants.map((variant, index) => <View key={variant.id} className="mb-4 rounded-2xl border border-theme-neutrals-700 p-4">
      <Text className="mb-3 font-semibold text-theme-neutrals-100">{index + 1}. {variant.title || t('creator.campaignVariantTitle')}</Text>
      <Text className="mb-2 text-sm text-theme-neutrals-100">{t('creator.campaignFormat')}</Text>
      <View className="flex-row flex-wrap gap-2">{MARKETING_FORMATS.map(format => <Pressable key={format.id} accessibilityRole="button" accessibilityState={{ selected: variant.format === format.id }} onPress={() => update(variant.id, { format: format.id })} className="rounded-xl border border-theme-neutrals-500 px-3 py-2" style={{ opacity: variant.format === format.id ? 1 : 0.5 }}><Text className="text-xs text-theme-neutrals-100">{t(`creator.marketing.formats.${format.id}`)} · {format.aspect}</Text></Pressable>)}</View>
      {CAMPAIGN_VARIANT_FIELDS.map(item => <View key={item}>{field(t(labels[item]), variant[item], campaignFieldLimit(item), value => update(variant.id, { [item]: value }), item === 'script' ? 4 : 2)}</View>)}
      <View className="mt-4 flex-row flex-wrap gap-2">
        {button(t('creator.marketing.open'), () => { const draft = campaignVariantDraft(brief, plan, variant.id); if (draft) onPrepare(draft); }, !brief.product.trim() || !brief.description.trim())}
        {button(t('editor.film.earlier'), () => { const variants = [...plan.variants]; [variants[index], variants[index - 1]] = [variants[index - 1], variants[index]]; setSaved({ ...plan, variants }); }, index === 0)}
        {button(t('editor.film.later'), () => { const variants = [...plan.variants]; [variants[index], variants[index + 1]] = [variants[index + 1], variants[index]]; setSaved({ ...plan, variants }); }, index === plan.variants.length - 1)}
        {button(t('editor.film.remove'), () => setSaved({ ...plan, variants: plan.variants.filter(item => item.id !== variant.id) }))}
      </View>
    </View>)}
  </View>;
}
