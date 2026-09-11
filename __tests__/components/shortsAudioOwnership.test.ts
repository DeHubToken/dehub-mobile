import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Shorts audio ownership', () => {
  const source = readFileSync(
    resolve(__dirname, '../../screens/ShortsViewerScreen.tsx'),
    'utf8',
  );

  it('uses one stable stop callback for both focus managers', () => {
    expect(source).toContain('requestFeedVideoFocus(stopPlayback);');
    expect(source).toContain('requestAudioFocus(stopPlayback);');
    expect(source).toContain('releaseFeedVideoFocus(stopPlayback);');
    expect(source).toContain('releaseAudioFocus(stopPlayback);');
  });

  it('rejects native playback events after a short becomes inactive', () => {
    expect(source).toContain('if (playing && !isActiveRef.current)');
    expect(source).toContain('if (!isActiveRef.current)');
    expect(source).toMatch(/return \(\) => \{\s*stopPlayback\(\);[\s\S]*?releaseFeedVideoFocus/);
  });
});
