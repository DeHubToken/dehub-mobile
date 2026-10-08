import i18n from 'i18next';

/** Display wording only; callers keep the original symbol for settlement. */
export function tokenLabel(symbol: string | null | undefined = 'DHB'): string {
  return !symbol || /^(?:\$?DHB|DEHUB)$/i.test(symbol.trim())
    ? i18n.t('tip.tokensUnit', { defaultValue: 'tokens' })
    : symbol;
}
