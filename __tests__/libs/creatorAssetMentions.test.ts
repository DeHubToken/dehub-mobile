import { remapAssetMentions } from '../../libs/creatorAssetMentions';

describe('asset prompt references', () => {
  const assets = [
    { key: 'character', kind: 'image' as const },
    { key: 'clip', kind: 'video' as const },
    { key: 'setting', kind: 'image' as const },
    { key: 'product', kind: 'image' as const },
  ];
  it('removes deleted references and renumbers remaining references in one pass', () => {
    expect(remapAssetMentions('Use @Image1, @Image2 and @Image3 in @Video1.', assets, assets.slice(1)))
      .toBe('Use , @Image1 and @Image2 in @Video1.');
  });
  it('keeps ordinary text and email addresses unchanged', () => {
    expect(remapAssetMentions('Email user@Image2.com; use @image2. @Image20 stays literal.', assets, assets.slice(1)))
      .toBe('Email user@Image2.com; use @Image1. @Image20 stays literal.');
  });
  it('keeps named references stable when adding assets and removes deleted clips', () => {
    expect(remapAssetMentions('@Image1 @Video1', assets, assets.filter(asset => asset.kind === 'image')))
      .toBe('@Image1 ');
    expect(remapAssetMentions('@Image1 @Image2', assets.slice(0, 3), assets)).toBe('@Image1 @Image2');
  });
});
