
import { AudibleReplay, createDubTipClaim, foreignDubLanguage } from '../../libs/dub-discovery';

function listen(replay: AudibleReplay, from = 0, audible = true, clock = 0) {
  for (let second = 0; second <= 12; second++) {
    if (replay.sample(from + second, 30, audible, clock + second * 1000)) return true;
  }
  return false;
}

describe('dubbing discovery evidence', () => {
  it('requires a meaningful second audible pass, rather than one play or renders', () => {
    const replay = new AudibleReplay();
    expect(listen(replay)).toBe(false);
    replay.seek(0);
    expect(listen(replay, 0, true, 13000)).toBe(true);
    expect(listen(replay, 0, true, 27000)).toBe(false);
  });
  it('counts reopening the same video after a meaningful listen', () => {
    const replay = new AudibleReplay();
    listen(replay); replay.detach();
    expect(listen(replay, 0, true, 20000)).toBe(true);
  });
  it('does not count muted, paused, buffering, seek jumps or tiny replays', () => {
    const replay = new AudibleReplay();
    listen(replay, 0, false); replay.seek(0);
    expect(listen(replay, 0, true, 13000)).toBe(false);
    const seek = new AudibleReplay();
    seek.sample(0, 30, true, 0); seek.sample(29, 30, true, 1000); seek.seek(0);
    expect(listen(seek, 0, true, 2000)).toBe(false);
    const stalled = new AudibleReplay();
    for (let i = 0; i < 100; i++) stalled.sample(0, 30, true, i * 1000);
    stalled.seek(0);
    expect(listen(stalled, 0, true, 101000)).toBe(false);
  });
  it('compares reliable language bases and aliases only', () => {
    expect(foreignDubLanguage('es-MX', 'en-GB')).toBe(true);
    for (const [from, to] of [['en-US', 'en_GB'], ['', 'en'], ['und', 'en'], ['auto', 'en'], ['he', 'iw'], ['nb', 'no']]) {
      expect(foreignDubLanguage(from, to)).toBe(false);
    }
  });
});

describe('durable dubbing tip claim', () => {
  const wallet = '0x1111111111111111111111111111111111111111';
  it('allows only the atomic winning client, including a fresh client after reinstall', async () => {
    let seen = false;
    const server = jest.fn(async () => { if (seen) return false; seen = true; return true; });
    const show = jest.fn();
    const web = createDubTipClaim(server), native = createDubTipClaim(server);
    await Promise.all([web(wallet, show, () => true), native(wallet, show, () => true), web(wallet, show, () => true)]);
    await createDubTipClaim(server)(wallet, show, () => true);
    expect(show).toHaveBeenCalledTimes(1);
    expect(server).toHaveBeenCalledTimes(3);
  });
  it('stays quiet when the durable status fails and bounds attempts for the session', async () => {
    const server = jest.fn(async () => { throw new Error('offline'); });
    const show = jest.fn(), claim = createDubTipClaim(server);
    await claim(wallet, show, () => true); await claim(wallet, show, () => true);
    expect(server).toHaveBeenCalledTimes(1); expect(show).not.toHaveBeenCalled();
  });
  it('suppresses a response after opt-in, sign-out or leaving the player', async () => {
    let finish!: (value: boolean) => void;
    const claim = createDubTipClaim(() => new Promise(resolve => { finish = resolve; }));
    const show = jest.fn(); let eligible = true;
    const pending = claim(wallet, show, () => eligible);
    eligible = false; finish(true); await pending;
    expect(show).not.toHaveBeenCalled();
  });
  it('never claims for a signed-out or ineligible viewer', async () => {
    const server = jest.fn(async () => true), claim = createDubTipClaim(server);
    await claim('', jest.fn(), () => true); await claim(wallet, jest.fn(), () => false);
    expect(server).not.toHaveBeenCalled();
  });
});
