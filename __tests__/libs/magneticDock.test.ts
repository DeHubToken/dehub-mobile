import { measureDockTarget, registerDockTarget, type DockTarget } from '../../libs/magneticDock';

const target: DockTarget = { x: 174, y: 48, width: 42, height: 36, tint: '#fff', hide: jest.fn() };
afterEach(() => { jest.useRealTimers(); });

it('measures only the currently focused header and unregisters it', async () => {
  const old = registerDockTarget(done => done({ ...target, y: 900 }));
  const current = registerDockTarget(done => done(target));
  old();
  expect(await measureDockTarget()).toBe(target);
  current();
  expect(await measureDockTarget()).toBeNull();
});

it('discards a measurement if navigation changed before it returned', async () => {
  let respond: (value: DockTarget | null) => void = () => {};
  const unregister = registerDockTarget(done => { respond = done; });
  const pending = measureDockTarget();
  unregister();
  respond(target);
  expect(await pending).toBeNull();
});

it('falls back within 100ms when native layout never responds', async () => {
  jest.useFakeTimers();
  const unregister = registerDockTarget(() => {});
  const pending = measureDockTarget();
  jest.advanceTimersByTime(100);
  expect(await pending).toBeNull();
  unregister();
});

it('does not strand the cover when native measurement throws', async () => {
  const unregister = registerDockTarget(() => { throw new Error('unmounted view'); });
  expect(await measureDockTarget()).toBeNull();
  unregister();
});
