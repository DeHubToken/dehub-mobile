jest.mock('react-native-reanimated', () => ({ __esModule: true, makeMutable: (value: number) => ({ value }) }));

import { getBackdropFrost, scaleAlpha, setBackdropFrost, setBackdropFrostSize } from '../../libs/backdropFrost';
import { FROST_SNAPSHOT_SCRIPT } from '../../libs/backdropFrostScript';

describe('backdrop frost', () => {
  afterEach(() => setBackdropFrost(null));

  it('waits for the backdrop size before handing cards a picture', () => {
    setBackdropFrost('data:image/jpeg;base64,AAAA');
    expect(getBackdropFrost()).toBeNull();
    setBackdropFrostSize(390, 844);
    setBackdropFrost('data:image/jpeg;base64,AAAA');
    expect(getBackdropFrost()).toEqual({ uri: 'data:image/jpeg;base64,AAAA', width: 390, height: 844 });
  });

  it('thins the card tint that sits over the frost', () => {
    expect(scaleAlpha('rgba(10,20,30,0.7)', 0.5)).toBe('rgba(10,20,30,0.35)');
    expect(scaleAlpha('rgb(10,20,30)', 0.5)).toBe('rgba(10,20,30,0.5)');
    expect(scaleAlpha('#123456', 0.5)).toBe('#123456');
  });

  it('copies the scene inside its own frame (WebGL canvases are blank afterwards)', () => {
    expect(FROST_SNAPSHOT_SCRIPT).toContain('window.requestAnimationFrame = function');
    expect(FROST_SNAPSHOT_SCRIPT).toContain('ReactNativeWebView.postMessage');
  });
});
