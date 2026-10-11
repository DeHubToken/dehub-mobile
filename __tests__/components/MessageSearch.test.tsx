import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity' }));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import MessageSearch from '../../components/DM/MessageSearch';

it('finds opened messages, cycles through matches, and excludes undecryptable messages', () => {
  const select = jest.fn();
  const close = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<MessageSearch messages={[
    { _id: 'one', content: 'Meet tomorrow' }, { _id: 'two', content: 'TOMORROW at noon' },
    { _id: 'three', content: 'Later today' }, { _id: 'locked', content: 'tomorrow', undecryptable: true },
  ]} onSelect={select} onClose={close} />); });
  const input = tree.root.findByType('TextInput' as any);
  act(() => input.props.onChangeText(' tomorrow '));
  act(() => input.props.onSubmitEditing());
  expect(select).toHaveBeenLastCalledWith('one');
  act(() => input.props.onSubmitEditing());
  expect(select).toHaveBeenLastCalledWith('two');
  act(() => input.props.onSubmitEditing());
  expect(select).toHaveBeenLastCalledWith('one');
  const previous = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'dex.previous')[0];
  act(() => previous.props.onPress());
  expect(select).toHaveBeenLastCalledWith('two');
  act(() => input.props.onChangeText('no match'));
  select.mockClear();
  act(() => input.props.onSubmitEditing());
  expect(select).not.toHaveBeenCalled();
  const dismiss = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'common.close')[0];
  act(() => dismiss.props.onPress());
  expect(close).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});
