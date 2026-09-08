import PictureInPictureButton from '../../components/common/PictureInPictureButton';
import { isPictureInPictureSupported } from 'expo-video';
import { toastInfo } from '../../libs';

jest.mock('expo-video', () => ({ isPictureInPictureSupported: jest.fn(() => true) }));
jest.mock('@expo/vector-icons', () => ({ MaterialIcons: 'Icon' }));
jest.mock('../../libs', () => ({ toastInfo: jest.fn() }));
jest.mock('react-native', () => ({ Pressable: 'Pressable' }));
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));

describe('picture-in-picture control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isPictureInPictureSupported as jest.Mock).mockReturnValue(true);
  });

  it('pops out the current player without forwarding the tap to play/pause', async () => {
    const startPictureInPicture = jest.fn().mockResolvedValue(undefined);
    const stopPropagation = jest.fn();
    const button = PictureInPictureButton({ videoRef: { current: { startPictureInPicture } as any } });
    button!.props.onPress({ stopPropagation });
    await Promise.resolve();
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(startPictureInPicture).toHaveBeenCalledTimes(1);
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('explains denied PiP permission without an unhandled rejection', async () => {
    const startPictureInPicture = jest.fn().mockRejectedValue(new Error('Permission denied'));
    const button = PictureInPictureButton({ videoRef: { current: { startPictureInPicture } as any } });
    button!.props.onPress({ stopPropagation: jest.fn() });
    await Promise.resolve();
    expect(toastInfo).toHaveBeenCalledTimes(1);
  });

  it('does not offer an unavailable device feature', () => {
    (isPictureInPictureSupported as jest.Mock).mockReturnValue(false);
    expect(PictureInPictureButton({ videoRef: { current: null } })).toBeNull();
  });
});
