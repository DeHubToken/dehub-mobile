import { normalizeCategoryList, normalizeCategoryName } from '../../libs/strings.util';

describe('normalizeCategoryName', () => {
  it('drops leading hashtag and mention marks', () => {
    expect(normalizeCategoryName('#business')).toBe('business');
    expect(normalizeCategoryName('@bollywood')).toBe('bollywood');
    expect(normalizeCategoryName('  board   game ')).toBe('board game');
  });
});

describe('normalizeCategoryList', () => {
  it('splits joined selections, cleans and dedupes', () => {
    expect(normalizeCategoryList(['mystery|||#family secrets', 'cats, pets', '#All', 'all', '@']))
      .toEqual(['mystery', 'family secrets', 'cats', 'pets', 'All']);
  });
});
