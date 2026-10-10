/** Replay evidence stays in memory; the account's once-only claim lives on the server. */
export function foreignDubLanguage(source: string | null | undefined, target: string | null | undefined): boolean {
  const base = (value: string | null | undefined) => {
    const tag = value?.trim().toLowerCase().replace(/_/g, '-');
    if (!tag || !/^[a-z]{2,3}(-[a-z0-9]{2,8}){0,2}$/.test(tag)) return '';
    const code = tag.split('-')[0];
    if (['und', 'mul', 'zxx'].includes(code)) return '';
    return ({ iw: 'he', no: 'nb', tl: 'fil' } as Record<string, string>)[code] ?? code;
  };
  const from = base(source), to = base(target);
  return !!from && !!to && from !== to;
}

export class AudibleReplay {
  private position: number | null = null;
  private at: number | null = null;
  private listening = false;
  private seconds = 0;
  private completed = false;
  private threshold = Infinity;
  private reported = false;

  sample(position: number, duration: number, audible: boolean, at: number, rate = 1): boolean {
    if (!Number.isFinite(position) || !Number.isFinite(duration) || duration < 4) return false;
    this.threshold = Math.min(12, Math.max(4, duration * 0.6));
    const delta = this.position === null ? 0 : position - this.position;
    if (delta < -1) this.rewind();
    const elapsed = this.at === null ? 0 : (at - this.at) / 1000;
    // Only real progress between two audible samples counts. Buffering,
    // scrubbing, background gaps and a forward seek cannot manufacture time.
    if (audible && this.listening && delta > 0 && elapsed > 0 && elapsed <= 5
      && delta <= elapsed * Math.max(0.1, rate) + 0.5) this.seconds += delta;
    this.position = position;
    this.at = at;
    this.listening = audible;
    if (!this.reported && this.completed && this.seconds >= this.threshold) {
      this.reported = true;
      return true;
    }
    return false;
  }

  seek(position: number) {
    if (this.position !== null && position < this.position - 1) this.rewind();
    this.position = position;
    this.at = null;
    this.listening = false;
  }

  detach() {
    // A meaningful listen followed by reopening the same video also counts.
    if (this.seconds >= this.threshold) { this.completed = true; this.seconds = 0; }
    this.at = null;
    this.listening = false;
  }

  private rewind() {
    if (this.seconds >= this.threshold) this.completed = true;
    this.seconds = 0;
  }
}

const replays = new Map<string, AudibleReplay>();
export function replayFor(key: string): AudibleReplay {
  let replay = replays.get(key);
  if (!replay) {
    if (replays.size >= 128) replays.delete(replays.keys().next().value!);
    replay = new AudibleReplay();
    replays.set(key, replay);
  }
  return replay;
}

/** No local flag can authorise a toast. An unavailable backend stays quiet. */
export function createDubTipClaim(claim: (wallet: string) => Promise<boolean>) {
  const attempted = new Set<string>();
  return async (wallet: string, show: () => void, stillEligible: () => boolean) => {
    wallet = wallet.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(wallet) || attempted.has(wallet) || !stillEligible()) return;
    attempted.add(wallet);
    try {
      if (await claim(wallet) && stillEligible()) show();
    } catch { /* no durable claim, no hint */ }
  };
}
