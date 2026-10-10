import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fireEvent, render } from '@testing-library/react-native';
import AgentSheet from '../../components/editor/AgentSheet';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', Modal: 'Modal',
  Pressable: 'Pressable', ScrollView: 'ScrollView', Switch: 'Switch',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'android' },
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 32, bottom: 48, left: 0, right: 0 }) }));
const mockKeyboard = { isVisible: false, height: 0 };
jest.mock('../../hooks/useKeyboard', () => ({ useKeyboard: () => mockKeyboard }));
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ address: 'alice' }) }));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/DeHubLoader', () => ({ DeHubLoader: 'DeHubLoader' }));

const editor = readFileSync(join(process.cwd(), 'screens', 'MediaEditorScreen.tsx'), 'utf8');

const renderSheet = () =>
  render(
    <AgentSheet projectId="project-a" visible visualScope="source-a" entries={[]} busy={false} onSend={jest.fn()} onUndo={jest.fn()} onClose={jest.fn()} onClear={jest.fn()} onOpenGenerator={jest.fn()} />,
  );

const sheetOf = (screen: ReturnType<typeof renderSheet>) => {
  const kav = screen.UNSAFE_getByType('KeyboardAvoidingView' as any);
  return { kav, sheet: kav.children[1] as any };
};

describe('media editor AI sheet', () => {
  afterEach(() => {
    mockKeyboard.isVisible = false;
  });

  it('reopens the chosen voice or video request and disables review while busy', () => {
    const voice = { kind: 'voice' as const, prompt: 'First sentence. Keep the last sentence.' };
    const video = { kind: 'video' as const, prompt: 'Waves at night', aspect: '9:16' };
    const props = {
      projectId: 'project-a', visible: true, visualScope: 'source-a', busy: false, onSend: jest.fn(), onUndo: jest.fn(), onClose: jest.fn(),
      onClear: jest.fn(), onOpenGenerator: jest.fn(),
      entries: [
        { id: 'voice', role: 'assistant' as const, content: 'Voice draft', generate: voice },
        { id: 'video', role: 'assistant' as const, content: 'Video draft', generate: video },
      ],
    };
    const screen = render(<AgentSheet {...props} />);
    const review = screen.getAllByLabelText('editor.agent.openGenerator');
    fireEvent.press(review[1]);
    expect(props.onOpenGenerator).toHaveBeenLastCalledWith(video);
    fireEvent.press(review[0]);
    expect(props.onOpenGenerator).toHaveBeenLastCalledWith(voice);
    expect(props.onUndo).not.toHaveBeenCalled();
    screen.rerender(<AgentSheet {...props} busy />);
    fireEvent.press(screen.getAllByLabelText('editor.agent.openGenerator')[0]);
    expect(props.onOpenGenerator).toHaveBeenCalledTimes(2);
  });

  it('requires frame consent for the current video and clears it when the source or sheet changes', () => {
    const props = {
      projectId: 'project-a', visible: true, visualScope: 'source-a', entries: [], busy: false,
      onSend: jest.fn(), onUndo: jest.fn(), onClose: jest.fn(),
      onClear: jest.fn(), onOpenGenerator: jest.fn(),
    };
    const screen = render(<AgentSheet {...props} />);
    const control = () => screen.getByLabelText('editor.highlights.visual');
    const send = () => {
      fireEvent.changeText(screen.getByLabelText('editor.agent.placeholder'), 'Find 15 second highlights');
      fireEvent.press(screen.getByLabelText('editor.agent.send'));
    };
    expect(control().props.value).toBe(false);
    expect(screen.queryByText('editor.highlights.visualPrivacy')).toBeNull();
    send();
    expect(props.onSend).toHaveBeenLastCalledWith('Find 15 second highlights', false);
    fireEvent(control(), 'valueChange', true);
    expect(screen.getByText('editor.highlights.visualPrivacy')).toBeTruthy();
    send();
    expect(props.onSend).toHaveBeenLastCalledWith('Find 15 second highlights', true);
    screen.rerender(<AgentSheet {...props} visualScope="source-b" />);
    expect(control().props.value).toBe(false);
    send();
    expect(props.onSend).toHaveBeenLastCalledWith('Find 15 second highlights', false);
    screen.rerender(<AgentSheet {...props} />);
    expect(control().props.value).toBe(false);
    fireEvent(control(), 'valueChange', true);
    screen.rerender(<AgentSheet {...props} visible={false} />);
    screen.rerender(<AgentSheet {...props} />);
    expect(control().props.value).toBe(false);
    screen.rerender(<AgentSheet {...props} busy />);
    expect(control().props.disabled).toBe(true);
  });

  it('lifts on Android from a keyboard view that fills the modal, backdrop included', () => {
    const screen = renderSheet();
    const modal = screen.UNSAFE_getByType('Modal' as any);
    const { kav } = sheetOf(screen);
    expect(modal.children[0]).toBe(kav);
    expect(kav.props.behavior).toBe('padding');
    expect(kav.props.style).toEqual({ flex: 1 });
    expect((kav.children[0] as any).props.accessibilityLabel).toBe('common.close');
  });

  it('shrinks the sheet and its list instead of pushing the input under the keys', () => {
    const screen = renderSheet();
    const { sheet } = sheetOf(screen);
    expect(sheet.props.style).toMatchObject({ maxHeight: 560, flexShrink: 1 });
    expect(screen.UNSAFE_getByType('ScrollView' as any).props.style).toEqual({ maxHeight: 360, flexShrink: 1 });
  });

  it('clears the nav bar when the keyboard is down and drops the inset when it is up', () => {
    const down = sheetOf(renderSheet()).sheet;
    expect(down.props.style.paddingBottom).toBe(48);
    mockKeyboard.isVisible = true;
    const up = sheetOf(renderSheet()).sheet;
    expect(up.props.style.paddingBottom).toBe(0);
  });
});

describe('media editor screen insets', () => {
  it('leaves the status and nav bar insets to the root SafeAreaView', () => {
    expect(editor).not.toContain('paddingTop: insets.top');
    expect(editor).toContain('<View className="flex-1 bg-black">');
    expect(editor).toContain('<View className="bg-theme-neutrals-900 border-t border-white/10">');
  });

  it('keeps the export sheet buttons above the nav bar', () => {
    const exportSheet = readFileSync(join(process.cwd(), "components", "editor", "ExportSheet.tsx"), "utf8");
    expect(exportSheet).toContain('const insets = useSafeAreaInsets();');
    expect(exportSheet).toContain('paddingBottom: insets.bottom + 20');
    expect(editor).not.toContain("useSafeAreaInsets()");
  });

  it('lifts the text and rename prompt on Android too', () => {
    expect(editor).not.toContain('Platform.OS === "ios" ? "padding" : undefined');
    expect(editor).toContain('<KeyboardAvoidingView behavior="padding" className="flex-1 justify-center bg-black/70 px-6">');
  });
});
