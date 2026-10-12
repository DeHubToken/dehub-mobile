import { editorGenerationKinds } from '../../libs/editor/generationCapabilities';

describe('installed generation capabilities', () => {
  it('advertises all installed visual, voice, music and sound-effect controls', () => {
    const kinds = editorGenerationKinds();
    expect(kinds).toEqual(['image', 'video', 'voice', 'music', 'sfx']);
    expect(kinds).not.toContain('audio'); expect(kinds).not.toContain('3d');
  });
  it('adapts to an older editor and to newly installed audio controls', () => {
    expect(editorGenerationKinds(kind => kind === 'image' || kind === 'video')).toEqual(['image', 'video']);
    expect(editorGenerationKinds(() => true)).toEqual(['image', 'video', 'voice', 'music', 'sfx']);
  });
});
