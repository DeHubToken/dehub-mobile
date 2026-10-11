import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import SoundEffectsPanel from '../../components/editor/SoundEffectsPanel';
import { importSoundEffect } from '../../libs/editor/importSoundEffect';
import type { MediaMeta } from '../../libs/editor/storage';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', StyleSheet: { flatten: (style: unknown) => style } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../libs/editor/importSoundEffect', () => ({ importSoundEffect: jest.fn() }));
jest.mock('../../hooks/useSurfaceDraft', () => ({ useSurfaceDraft: (_key: string, initial: string) => {
  const React = require('react');
  const [value, set] = React.useState(initial);
  const setter = React.useMemo(() => Object.assign(set, { initialize: (next: string) => set((previous: string) => previous || next), complete: (_captured: string, next: string) => set(next) }), []);
  return [value, setter];
} }));
const media = { id: 'sound', kind: 'audio', duration: 3.04 } as MediaMeta;
const deferred = () => {
  let resolve!: (value: MediaMeta) => void;
  const promise = new Promise<MediaMeta>(done => { resolve = done; });
  return { promise, resolve };
};
function fixture() {
  const release = jest.fn(), onAdd = jest.fn();
  return { props: { at: 7.5, scope: 1, draftScope: 'account|project', wallet: 'wallet', prefill: 'Gentle rain',
    subscribe: jest.fn(() => () => {}), onAdd, onStart: jest.fn(() => ({ isCurrent: () => true, release })) }, release, onAdd };
}
describe('sound creation in a saved editor project', () => {
  beforeEach(() => { jest.resetAllMocks(); });
  it('only generates after review, captures a decimal duration and adds the complete sound at the captured playhead', async () => {
    const { props, onAdd, release } = fixture(); jest.mocked(importSoundEffect).mockResolvedValue(media);
    const view = render(<SoundEffectsPanel {...props} />);
    expect(view.getByLabelText('nav.prompt').props.value).toBe('Gentle rain'); expect(importSoundEffect).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText('creator.auto'));
    fireEvent.changeText(view.getByLabelText('filters.duration'), '0,5'); fireEvent.press(view.getByLabelText('creator.loop'));
    await act(async () => { fireEvent.press(view.getByLabelText('paywall.generate')); });
    expect(importSoundEffect).toHaveBeenCalledWith({ text: 'Gentle rain', durationSeconds: 0.5, loop: true }, 'wallet', expect.any(AbortSignal));
    expect(onAdd).toHaveBeenCalledWith(media, 7.5); expect(onAdd).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1);
  });
  it('cancels its request, releases editing and ignores late audio without disturbing a newer request', async () => {
    const { props, onAdd } = fixture(), first = deferred(), second = deferred();
    jest.mocked(importSoundEffect).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<SoundEffectsPanel {...props} />);
    fireEvent.press(view.getByLabelText('paywall.generate')); const firstSignal = jest.mocked(importSoundEffect).mock.calls[0][2];
    fireEvent.press(view.getByLabelText('common.cancel')); expect(firstSignal?.aborted).toBe(true);
    fireEvent.press(view.getByLabelText('paywall.generate'));
    await act(async () => { first.resolve(media); }); expect(onAdd).not.toHaveBeenCalled(); expect(view.getByLabelText('common.cancel')).toBeTruthy();
    await act(async () => { second.resolve(media); }); expect(onAdd).toHaveBeenCalledTimes(1);
  });
  it.each(['scope', 'draftScope', 'wallet'] as const)('rejects an old completion after %s changes', async field => {
    const { props, onAdd, release } = fixture(), result = deferred(); jest.mocked(importSoundEffect).mockReturnValue(result.promise);
    const view = render(<SoundEffectsPanel {...props} />); fireEvent.press(view.getByLabelText('paywall.generate'));
    view.rerender(<SoundEffectsPanel {...props} {...{ [field]: field === 'scope' ? 2 : 'other' }} />);
    expect(jest.mocked(importSoundEffect).mock.calls[0][2]?.aborted).toBe(true);
    await act(async () => { result.resolve(media); }); expect(onAdd).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledTimes(1);
  });
  it.each(['', '0', '0.49', '30.1', 'NaN'])('does not start invalid manual duration %s', value => {
    const { props } = fixture(); const view = render(<SoundEffectsPanel {...props} />);
    fireEvent.press(view.getByLabelText('creator.auto')); fireEvent.changeText(view.getByLabelText('filters.duration'), value);
    fireEvent.press(view.getByLabelText('paywall.generate')); expect(importSoundEffect).not.toHaveBeenCalled();
  });
  it('aborts on unmount and does not add a late result', async () => {
    const { props, onAdd } = fixture(), result = deferred(); jest.mocked(importSoundEffect).mockReturnValue(result.promise);
    const view = render(<SoundEffectsPanel {...props} />); fireEvent.press(view.getByLabelText('paywall.generate')); view.unmount();
    expect(jest.mocked(importSoundEffect).mock.calls[0][2]?.aborted).toBe(true);
    await act(async () => { result.resolve(media); }); expect(onAdd).not.toHaveBeenCalled();
  });
  it('keeps the pending sound when editing ownership rerenders the same project with a new subscribe callback', async () => {
    const { props, onAdd } = fixture(), result = deferred(); jest.mocked(importSoundEffect).mockReturnValue(result.promise);
    const view = render(<SoundEffectsPanel {...props} />); fireEvent.press(view.getByLabelText('paywall.generate'));
    view.rerender(<SoundEffectsPanel {...props} subscribe={() => () => {}} />);
    expect(jest.mocked(importSoundEffect).mock.calls[0][2]?.aborted).toBe(false);
    await act(async () => { result.resolve(media); }); expect(onAdd).toHaveBeenCalledWith(media, 7.5);
  });
});
