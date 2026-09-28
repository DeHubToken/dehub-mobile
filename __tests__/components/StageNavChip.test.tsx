import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../context/StageContext', () => ({ useStages: () => mockStage }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ colors: { foreground: '#fff', background: '#000' } }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
import StageMiniPlayer from '../../components/Stages/StageMiniPlayer';

const mockStage = { currentSpace: { title: 'Live room' }, isConnected: true, isModalOpen: false, openModal: jest.fn() };

it('reopens the room from its one button and disappears when expanded or disconnected', () => {
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<StageMiniPlayer />); });
  const button = tree.root.findAllByProps({ testID: 'stage-nav-chip' })[0];
  act(() => button.props.onPress());
  expect(mockStage.openModal).toHaveBeenCalledWith('live');
  mockStage.isModalOpen = true;
  act(() => tree.update(<StageMiniPlayer />));
  expect(tree.toJSON()).toBeNull();
  mockStage.isModalOpen = false;
  mockStage.isConnected = false;
  act(() => tree.update(<StageMiniPlayer />));
  expect(tree.toJSON()).toBeNull();
  act(() => tree.unmount());
});
