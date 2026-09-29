import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => {
  const R = require('react');
  return {
    View: 'View',
    Text: 'Text',
    TouchableOpacity: 'TouchableOpacity',
    StyleSheet: { create: (styles: unknown) => styles },
    FlatList: ({ data, renderItem, keyExtractor }: any) =>
      R.createElement(R.Fragment, null, data.map((item: any, index: number) =>
        R.createElement(R.Fragment, { key: keyExtractor(item) }, renderItem({ item, index })))),
  };
});
jest.mock('react-native-gesture-handler', () => ({ GestureDetector: 'GestureDetector' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/common/Avatar', () => 'Avatar');
jest.mock('../../components/Music/SectionHeader', () => 'SectionHeader');
jest.mock('../../components/Stages/StageMiniPlayer', () => 'StageMiniPlayer');
jest.mock('../../context/StageContext', () => ({ useStages: () => mockStage }));
jest.mock('../../context/PagerGestureContext', () => ({ useHorizontalScrollGuard: () => null }));
jest.mock('../../hooks/useKidsMode', () => ({ useKidsMode: () => ({ isKidsMode: false }) }));
jest.mock('../../libs/misc', () => ({ getAvatarUrl: () => '' }));

import StagesCarousel from '../../components/Music/StagesCarousel';
import StageNavFallback from '../../components/Stages/StageNavFallback';

const root = join(__dirname, '..', '..');
const readSource = (...path: string[]) => readFileSync(join(root, ...path), 'utf8').replace(/\r\n/g, '\n');
const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
};

const mockStage = {
  liveSpaces: [{ id: 'room-a', title: 'A' }, { id: 'room-b', title: 'B' }],
  currentSpace: null as null | { id: string },
  openModal: jest.fn(),
  joinSpace: jest.fn(),
  guestListenSpace: jest.fn(),
};

describe('Music feed stage cards', () => {
  let tree!: ReactTestRenderer;
  const cards = () => tree.root.findAllByType('TouchableOpacity' as any);
  const press = async (index: number) => {
    await act(async () => { cards()[index].props.onPress(); });
  };

  beforeEach(() => {
    mockStage.currentSpace = null;
    mockStage.openModal.mockReset();
    mockStage.joinSpace.mockReset().mockResolvedValue(false);
    mockStage.guestListenSpace.mockReset().mockResolvedValue(false);
    act(() => { tree = create(<StagesCarousel />); });
  });
  afterEach(() => act(() => tree.unmount()));

  it('joins the tapped room and opens it', async () => {
    mockStage.joinSpace.mockResolvedValue(true);
    await press(1);
    expect(mockStage.joinSpace).toHaveBeenCalledWith('room-b');
    expect(mockStage.guestListenSpace).not.toHaveBeenCalled();
    expect(mockStage.openModal).toHaveBeenCalledWith('live');
  });

  it('listens as a guest when it cannot join', async () => {
    mockStage.guestListenSpace.mockResolvedValue(true);
    await press(0);
    expect(mockStage.guestListenSpace).toHaveBeenCalledWith('room-a');
    expect(mockStage.openModal).toHaveBeenCalledWith('live');
  });

  it('falls back to the Stages hub when the room cannot be opened', async () => {
    await press(0);
    expect(mockStage.openModal).toHaveBeenCalledWith('browse');
    expect(mockStage.openModal).not.toHaveBeenCalledWith('live');
  });

  it('shows the room it is already in without joining again', async () => {
    mockStage.currentSpace = { id: 'room-a' };
    // Memoised with no props, so remount rather than update to re-read the stage.
    act(() => tree.unmount());
    act(() => { tree = create(<StagesCarousel />); });
    await press(0);
    expect(mockStage.joinSpace).not.toHaveBeenCalled();
    expect(mockStage.openModal).toHaveBeenCalledWith('live');
  });

  it('ignores a second tap while the first join is in flight', async () => {
    let finish!: (ok: boolean) => void;
    mockStage.joinSpace.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    await act(async () => {
      cards()[0].props.onPress();
      cards()[0].props.onPress();
    });
    expect(mockStage.joinSpace).toHaveBeenCalledTimes(1);
    await act(async () => { finish(true); });
    expect(mockStage.openModal).toHaveBeenCalledTimes(1);
  });

  it('keeps See all on the Stages hub', () => {
    tree.root.findByType('SectionHeader' as any).props.onSeeAll();
    expect(mockStage.openModal).toHaveBeenCalledWith('browse');
    expect(mockStage.joinSpace).not.toHaveBeenCalled();
  });
});

describe('minimised stage chip on pushed screens', () => {
  const render = (name: string) => {
    const navigationRef = { getCurrentRoute: () => ({ name }), addListener: () => () => {} };
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<StageNavFallback navigationRef={navigationRef} />); });
    const json = tree.toJSON() as any;
    act(() => tree.unmount());
    return json;
  };

  it('stays off screens whose composer sits where the chip would', () => {
    expect(render('Chat')).toBeNull();
    expect(render('LiveChat')).toBeNull();
    expect(render('FeedDetail')).toBeNull();
    expect(render('Home')).toBeNull();
  });

  it('shows on other pushed screens, clear of the nav bar', () => {
    const chip = render('Leaderboard');
    expect(chip).not.toBeNull();
    expect(chip.props.style).toMatchObject({ position: 'absolute', right: 16, bottom: 24 + 12 });
  });
});

describe('Go Live without camera permission', () => {
  const source = readSource('screens', 'LiveProducerScreen.tsx');
  const overlay = between(source, '{/* Permission overlay', '{/* Overlay container */}');

  it('leaves encoder mode alone', () => {
    expect(overlay).toContain('{!externalMode && !permission?.granted ? (');
    expect(source).toContain('if (!permission || externalMode) return;');
  });

  it('gives the overlay its own way out that never ends a broadcast unconfirmed', () => {
    expect(overlay).toContain('onPress={closeFromPermission}');
    expect(overlay).toContain('t("common.goBack")');
    const close = between(source, 'const closeFromPermission = useCallback(', '}, [stage, openEndConfirm, requestClose]);');
    expect(close).toContain('if (stage === "starting" || stage === "live" || stage === "ending") openEndConfirm();');
    expect(close).toContain('else requestClose();');
  });
});

describe('live stage modal in long languages', () => {
  const source = readSource('components', 'Stages', 'LiveStageModal.tsx');

  it('wraps the guest controls instead of pushing them off both edges', () => {
    const controls = between(source, '{/* Controls', '{canSpeak && (');
    expect(controls).toContain('flexWrap: "wrap"');
    const guest = between(source, '{isGuest && (', '{isListenerRole && (');
    expect(guest).toContain('minHeight: 56');
    expect(guest).not.toMatch(/\bheight: 56/);
    expect(guest).toContain('flexShrink: 1');
    expect(guest).toContain('numberOfLines={2}');
    expect(guest).toContain('textAlign: "center"');
  });

  it('wraps the header status line under the title', () => {
    expect(source).toContain('flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 3, columnGap: 8, rowGap: 4');
  });
});
