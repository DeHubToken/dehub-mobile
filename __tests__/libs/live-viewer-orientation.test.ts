import { createLiveViewerOrientation } from '../../libs/live-viewer-orientation';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
describe('live viewer orientation', () => {
  it('allows rotation before stream dimensions arrive, then follows the picture', async () => {
    const actions = { portrait: jest.fn(async () => {}), landscape: jest.fn(async () => {}), unlocked: jest.fn(async () => {}) };
    const update = createLiveViewerOrientation(actions);
    update(true);
    await flush();
    expect(actions.unlocked).toHaveBeenCalledTimes(1);
    update(true, { width: 1920, height: 1080 });
    await flush();
    expect(actions.landscape).toHaveBeenCalledTimes(1);
    update(true, { width: 1080, height: 1920 });
    await flush();
    expect(actions.portrait).toHaveBeenCalledTimes(1);
  });
  it('restores portrait after a slow landscape request completes following exit', async () => {
    let finish!: () => void;
    const actions = { portrait: jest.fn(async () => {}), landscape: jest.fn(() => new Promise<void>(resolve => { finish = resolve; })), unlocked: jest.fn(async () => {}) };
    const update = createLiveViewerOrientation(actions);
    update(true, { width: 1920, height: 1080 });
    update(false);
    expect(actions.portrait).not.toHaveBeenCalled();
    finish();
    await flush();
    expect(actions.portrait).toHaveBeenCalledTimes(1);
    update(false);
    await flush();
    expect(actions.portrait).toHaveBeenCalledTimes(1);
  });
  it('continues restoring the screen after a native rotation rejects', async () => {
    const actions = { portrait: jest.fn(async () => {}), landscape: jest.fn(async () => { throw Error('Unavailable'); }), unlocked: jest.fn(async () => {}) };
    const update = createLiveViewerOrientation(actions);
    update(true, { width: 1920, height: 1080 });
    update(false);
    await flush();
    expect(actions.portrait).toHaveBeenCalledTimes(1);
  });
});
