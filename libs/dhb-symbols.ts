/**
 * Every cashtag that means our token. $RIFT and $RIFTN are the new brand
 * (DeHub is becoming Riftn), so they resolve to DHB's card, logo and numbers
 * rather than to whatever unrelated coin also uses that ticker. Kept free of
 * imports so the asset resolver can use it without pulling in auth.
 */
const DHB_SYMBOLS = new Set(["DHB", "DEHUB", "RIFT", "RIFTN"]);

export function isDhbSymbol(symbol?: string | null): boolean {
  const s = symbol?.trim().replace(/^\$/, "").toUpperCase();
  return !!s && DHB_SYMBOLS.has(s);
}
