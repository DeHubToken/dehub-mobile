const mockValues = new Map<string, string>();
const mockMigrate = jest.fn(() => Promise.resolve());

jest.mock('../../libs/storage', () => ({
  storage: {
    getString: (key: string) => mockValues.get(key),
    set: (key: string, value: string) => mockValues.set(key, value),
  },
  migrateFromAsyncStorage: () => mockMigrate(),
}));

function restart(): typeof import('../../libs/videoMutedState') {
  let state!: typeof import('../../libs/videoMutedState');
  jest.isolateModules(() => { state = require('../../libs/videoMutedState'); });
  return state;
}

beforeEach(() => {
  mockValues.clear();
  mockMigrate.mockReset().mockResolvedValue(undefined);
});

it.each([true, false])('restores mute=%s before the startup effect runs', (muted) => {
  restart().setMutedState(muted);
  expect(restart().getCachedMuted()).toBe(muted);
});

it('stays silent until the legacy mute choice is restored', async () => {
  const state = restart();
  expect(state.getCachedMuted()).toBe(true);
  mockMigrate.mockImplementationOnce(async () => { mockValues.set('video-muted', 'false'); });
  await state.loadMutedState();
  expect(state.getCachedMuted()).toBe(false);
});

it('keeps a new tap made while migration is pending', async () => {
  let finish!: () => void;
  mockMigrate.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const state = restart();
  const loading = state.loadMutedState();
  state.setMutedState(true);
  mockValues.set('video-muted', 'false');
  finish();
  await loading;
  expect(state.getCachedMuted()).toBe(true);
});
