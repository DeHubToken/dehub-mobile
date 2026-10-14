import { Pressable, TextInput, Text, ScrollView } from 'react-native';
jest.mock('react-native', () => ({ Pressable: 'Pressable', TextInput: 'TextInput', Text: 'Text', ScrollView: 'ScrollView' }));
jest.mock('react-native-gesture-handler', () => ({}));
import { beginQuickActions, blockQuickActions, cancelQuickActions, moveQuickActions, openQuickActions, setQuickActionsEnabled, subscribeQuickActions, withQuickActions } from '../../libs/quickActions';

const touch = (x = 20, count = 1) => ({ nativeEvent: { pageX: x, pageY: 20, touches: Array(count).fill({}) } });
let unsubscribe: () => void;
const open = jest.fn();
beforeEach(() => { jest.useFakeTimers(); setQuickActionsEnabled(true); open.mockClear(); unsubscribe = subscribeQuickActions(open); });
afterEach(() => { unsubscribe(); cancelQuickActions(); jest.useRealTimers(); });

it('opens once on a plain surface and cancels a short press', () => {
  beginQuickActions(touch()); jest.advanceTimersByTime(650); expect(open).toHaveBeenCalledTimes(1);
  open.mockClear(); beginQuickActions(touch()); cancelQuickActions(); jest.advanceTimersByTime(700); expect(open).not.toHaveBeenCalled();
});
it('preserves owned long presses and press-in callbacks', () => {
  const reaction = jest.fn(), pressIn = jest.fn();
  const props = withQuickActions(Pressable, { onLongPress: reaction, onPressIn: pressIn, delayLongPress: 400 });
  beginQuickActions(touch()); props.onPressIn(); props.onLongPress(); jest.advanceTimersByTime(700);
  expect(reaction).toHaveBeenCalledTimes(1); expect(pressIn).toHaveBeenCalledTimes(1); expect(open).not.toHaveBeenCalled();
  expect(props.delayLongPress).toBe(400);
});
it('gives ordinary buttons their own hold without changing a normal press', () => {
  const press = jest.fn();
  const props = withQuickActions(Pressable, { onPress: press });
  beginQuickActions(touch()); props.onPressIn(); jest.advanceTimersByTime(700); expect(open).not.toHaveBeenCalled();
  props.onLongPress(); expect(open).toHaveBeenCalledTimes(1); expect(press).not.toHaveBeenCalled(); expect(props.onPress).toBe(press);
});
it('blocks scrolling, second fingers, text editing and native text selection', () => {
  beginQuickActions(touch()); moveQuickActions(touch(40)); jest.advanceTimersByTime(700);
  beginQuickActions(touch(20, 2)); jest.advanceTimersByTime(700);
  for (const [type, value] of [[TextInput, {}], [Text, { selectable: true }], [Text, { selectable: true, onPress: jest.fn() }]] as const) {
    beginQuickActions(touch()); withQuickActions(type, value).onTouchStart(); jest.advanceTimersByTime(700);
  }
  expect(open).not.toHaveBeenCalled();
});
it('disables a deferred button hold when it turns into a drag or another sheet opens', () => {
  const props = withQuickActions(Pressable, { onPress: jest.fn() });
  beginQuickActions(touch()); props.onPressIn(); moveQuickActions(touch(45)); props.onLongPress();
  expect(open).not.toHaveBeenCalled();
  beginQuickActions(touch()); setQuickActionsEnabled(false); openQuickActions(); jest.advanceTimersByTime(700);
  expect(open).not.toHaveBeenCalled();
});
it('stands down when a list starts scrolling, since Android stops sending JS the drag', () => {
  const begin = jest.fn();
  const props = withQuickActions(ScrollView, { onScrollBeginDrag: begin });
  beginQuickActions(touch()); props.onScrollBeginDrag(); jest.advanceTimersByTime(700);
  beginQuickActions(touch()); props.onMomentumScrollBegin(); jest.advanceTimersByTime(700);
  expect(open).not.toHaveBeenCalled(); expect(begin).toHaveBeenCalledTimes(1);
});
