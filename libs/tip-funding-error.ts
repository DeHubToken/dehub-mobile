/**
 * Errors from paying in DHB with another token, carried as a translation key
 * so the sheet shows them in the reader's language. The English message is the
 * fallback and what lands in logs. Mirror of web's src/lib/tip-funding-error.ts.
 */
export type FundingErrorKey =
  | 'noRoute'
  | 'lowLiquidity'
  | 'dpayNoAmount'
  | 'dpayDelayed'
  | 'noBridgeRoute'
  | 'bridgeCancelled'
  | 'bridgeSlow'
  | 'notEnoughOnBase'
  | 'notEnoughWithFees'
  | 'notEnough'
  | 'noGasForFee'
  | 'priceMoved'
  | 'usdcPending'
  | 'dhbPending'
  | 'unlockWallet'
  | 'chainUnavailable';

export class FundingError extends Error {
  constructor(
    readonly key: FundingErrorKey,
    message: string,
    readonly vars: Record<string, string | number> = {},
  ) {
    super(message);
    this.name = 'FundingError';
  }
}

/** What to show for an error thrown while funding a payment. */
export function fundingErrorText(
  t: (key: string, options?: Record<string, unknown>) => string,
  error: unknown,
): string {
  if (error instanceof FundingError) {
    return t(`tipFunding.${error.key}`, { ...error.vars, defaultValue: error.message });
  }
  return error instanceof Error ? error.message : String(error);
}
