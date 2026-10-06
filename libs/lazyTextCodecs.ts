/**
 * Fill in TextEncoder / TextDecoder only where the engine lacks them, and only
 * load the polyfill the first time something asks for one.
 *
 * Hermes ships TextEncoder but not TextDecoder. The old check replaced both
 * whenever either was missing, so every launch evaluated `text-encoding` —
 * about 550 KB of legacy encoding tables — and swapped Hermes's native
 * encoder for the slower JS one. Now the native encoder stays, and the
 * polyfill is required on first access of the missing global instead of at
 * boot. Anything that reads the global, `typeof` checks included, still gets
 * the full polyfill exactly as before.
 */
export function installLazyTextCodecs(target: Record<string, any>): void {
  for (const name of ["TextEncoder", "TextDecoder"] as const) {
    if (typeof target[name] !== "undefined") continue;
    let impl: unknown;
    Object.defineProperty(target, name, {
      configurable: true,
      enumerable: false,
      get() {
        if (impl === undefined) {
          try {
            impl = require("text-encoding")[name];
          } catch (e) {
            console.warn("[globals] text-encoding polyfill failed", e);
            impl = null;
          }
        }
        return impl ?? undefined;
      },
      set(value) {
        impl = value;
      },
    });
  }
}
