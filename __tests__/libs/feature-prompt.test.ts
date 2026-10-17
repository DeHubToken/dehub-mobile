import { featurePromptFields } from '../../libs/feature-prompt';

describe('prompt request compatibility', () => {
  it('posts without a separate title and preserves the entire prompt', () => {
    expect(featurePromptFields('  Pin our posts\nLet us choose three favourites.  ')).toEqual({
      title: 'Pin our posts', description: 'Pin our posts\nLet us choose three favourites.',
    });
  });
  it('bounds the generated heading without truncating the request or splitting emoji', () => {
    const prompt = 'a'.repeat(99) + '🙂 more context';
    const row = featurePromptFields(prompt);
    expect(row.title).toBe('a'.repeat(99));
    expect(row.description).toBe(prompt);
  });
  it('retains an optional title and bug device details', () => {
    expect(featurePromptFields('  Upload freezes  ', ' Upload bug ', ' Android 15 ')).toEqual({
      title: 'Upload bug', description: 'Upload freezes\n\nDevice & OS: Android 15',
    });
  });
});
