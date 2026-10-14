import { findMotionClip, loadFeaturedMotionClips, loadMotionCatalog, motionModel, searchMotionClips, type MotionClip } from '../../libs/motionLibrary';
import { maboroshiClipScript } from '../../libs/maboroshi';
import { MOTION_LIBRARY_COPY } from '../../i18n/motionLibraryCopy';
const clip: MotionClip = { id: '1'.repeat(20), name: 'Studio Rap Performance', category: 'Rap', tags: 'microphone studio',
  url: 'https://media.example/original.mp4', poster: 'https://media.example/original.webp', seconds: 12, width: 720, height: 1280, variants: [] };

describe('shared Creator source library', () => {
  it('keeps priority translations complete and preserves their interpolation fields', () => {
    const placeholder = (text: string) => text.match(/\{\{[^}]+\}\}/g) ?? [];
    for (const copy of Object.values(MOTION_LIBRARY_COPY)) {
      expect(Object.keys(copy)).toEqual(Object.keys(MOTION_LIBRARY_COPY.en));
      for (const key of Object.keys(MOTION_LIBRARY_COPY.en) as Array<keyof typeof MOTION_LIBRARY_COPY.en>) expect(placeholder(copy[key])).toEqual(placeholder(MOTION_LIBRARY_COPY.en[key]));
    }
  });
  it('uses the production catalog and resolves a featured deep link without loading the full collection', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ clips: [clip], total: 20000 }) } as Response);
    expect((await findMotionClip(clip.id))?.url).toBe(clip.url);
    expect(request).toHaveBeenCalledWith('https://dehub.io/creator-clips/featured.json');
    expect(request).toHaveBeenCalledTimes(1);
    await loadFeaturedMotionClips(); expect(request).toHaveBeenCalledTimes(1);
    await loadMotionCatalog(); expect(request).toHaveBeenCalledWith('https://dehub.io/creator-clips/catalog.json');
    request.mockRestore();
  });
  it('keeps the full rap performance within the selected model limits', () => {
    expect(motionModel({ ...clip, seconds: 30 })).toBe('kling-3-motion');
    expect(motionModel(clip)).toBe('kling-o3-edit');
    expect(searchMotionClips([clip], 'studio microphone', 'Rap')).toEqual([clip]);
    expect(searchMotionClips([clip], 'studio', 'Dance')).toEqual([]);
  });
  it('passes source selection only to the hosted studio and escapes script-breaking text', () => {
    const script = maboroshiClipScript({ ...clip, name: '</script>' });
    expect(script).toContain("location.origin==='https://live.dehub.io'");
    expect(script).toContain('maboroshi:native-clip'); expect(script).not.toContain('</script>');
  });
});
