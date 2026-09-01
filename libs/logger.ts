import { DEBUG as ENV_DEBUG } from '@env';

export type LogLevel = "debug" | "info" | "warn" | "error";

// Robust boolean parse for DEBUG env (supports true/1/yes as truthy)
export const isDebug: boolean = (() => {
  const v = (ENV_DEBUG as any);
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return false;
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
})();

function formatPrefix(scope?: string, level?: LogLevel) {
  const parts: string[] = [];
  if (scope) parts.push(`[${scope}]`);
  if (level && level !== "debug") parts.push(`[${level.toUpperCase()}]`);
  return parts.join("");
}

export function createLogger(scope?: string) {
  const logAt = (level: LogLevel) => (...args: any[]) => {
    if (level === "error") {
      // Always show errors
      // eslint-disable-next-line no-console
      console.error(formatPrefix(scope, level), ...args);
      // ...and ship them, which nothing did before: a console line on a
      // tester's phone is not readable by anyone. Required lazily so the
      // reporter's own imports stay out of this module's init, which runs
      // before almost everything else (config/env imports it).
      try {
        // eslint-disable-next-line
        require("./errorReporter").reportError(scope, args);
      } catch {}
      return;
    }
    if (!isDebug) return;
    // eslint-disable-next-line no-console
    const prefix = formatPrefix(scope, level);
    if (level === "warn") console.warn(prefix, ...args);
    else if (level === "info") console.info(prefix, ...args);
    else console.log(prefix, ...args);
  };

  return {
    debug: logAt("debug"),
    info: logAt("info"),
    warn: logAt("warn"),
    error: logAt("error"),
  } as const;
}

export type Logger = ReturnType<typeof createLogger>;
