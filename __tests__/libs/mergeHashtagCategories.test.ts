import { mergeHashtagCategories } from '../../libs/strings.util';

// Turning tags into categories is now ALL this does. It used to strip them out
// of the title and description too, which made a tag the author typed
// indistinguishable from one picked in the category selector — both ended up as
// invisible metadata, and the tag disappeared from their own post.
describe('mergeHashtagCategories', () => {
  it('adds typed hashtags to the picked categories', () => {
    expect(mergeHashtagCategories('Ride out #Thar', 'shot in #Bangalore', ['cars'])).toEqual([
      'cars',
      'Thar',
      'Bangalore',
    ]);
  });

  it('title-cases tags so one topic is one category however it was typed', () => {
    expect(mergeHashtagCategories('#GAMING', '#gaming', [])).toEqual(['Gaming']);
  });

  it('does not duplicate a tag that is already a picked category', () => {
    expect(mergeHashtagCategories('#Gaming', '', ['Gaming'])).toEqual(['Gaming']);
  });

  it('leaves the picked categories alone when nothing is tagged', () => {
    expect(mergeHashtagCategories('A title', 'A description', ['music'])).toEqual(['music']);
  });

  it('ignores a bare # and a tag opening on a digit', () => {
    expect(mergeHashtagCategories('# #1st', '', ['music'])).toEqual(['music']);
  });
});
