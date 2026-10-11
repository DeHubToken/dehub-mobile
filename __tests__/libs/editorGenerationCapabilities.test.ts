import { editorGenerationKinds } from '../../libs/editor/generationCapabilities';

describe('installed generation capabilities', () => {
  it('advertises existing visual and voice controls without inventing an audio kind', () => {
    const kinds = editorGenerationKinds();
    expect(kinds).toEqual(expect.arrayContaining(['image', 'video', 'voice']));
    expect(kinds).not.toContain('audio'); expect(kinds).not.toContain('3d');
  });
  it('adapts to an older editor and to newly installed audio controls', () => {
    expect(editorGenerationKinds(kind => kind === 'image' || kind === 'video')).toEqual(['image', 'video']);
    expect(editorGenerationKinds(() => true)).toEqual(['image', 'video', 'voice', 'music', 'sfx']);
  });
});
