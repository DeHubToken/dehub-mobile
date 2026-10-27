/** Local backpressure only; the server owns the durable budget. */
export class TranslationCooldown {
  private globalUntil = 0;
  private keys = new Map<string, number>();
  assertReady(key: string) {
    const now = Date.now();
    if (now < Math.max(this.globalUntil, this.keys.get(key) ?? 0)) throw new Error('Translation temporarily unavailable');
    this.keys.delete(key);
  }
  async observe(key: string, error: unknown) {
    const response = (error as { context?: Response })?.context;
    if (!response || ![429, 503].includes(response.status)) return;
    const body = await response.clone().json().catch(() => ({}));
    const raw = response.headers.get('retry-after');
    const seconds = raw && Number.isFinite(Number(raw)) ? Number(raw) : raw ? (Date.parse(raw) - Date.now()) / 1000 : 30;
    const until = Date.now() + Math.min(86400, Math.max(1, Number.isFinite(seconds) ? seconds : 30)) * 1000;
    if (body.code === 'TRANSLATION_IN_PROGRESS') {
      if (this.keys.size >= 200) this.keys.delete(this.keys.keys().next().value!);
      this.keys.set(key, until);
    } else this.globalUntil = Math.max(this.globalUntil, until);
  }
}

