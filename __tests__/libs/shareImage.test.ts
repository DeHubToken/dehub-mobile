import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getTextPostShareImageUrl, sharePostAsImage } from '../../libs/shareImage';

jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', downloadAsync: jest.fn() }));
jest.mock('../../config/env', () => ({ __esModule: true, default: { API_URL: 'https://api.dehub.io/api' } }));

const download = FileSystem.downloadAsync as jest.Mock;
const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
const originalOS = Platform.OS;
beforeEach(() => { jest.clearAllMocks(); Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' }); });
afterAll(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }); });

it('shares the production text card and retains the off-chain link on iOS', async () => {
  download.mockResolvedValue({ status: 200, headers: { 'Content-Type': 'image/png' } });
  await sharePostAsImage(6501, 'https://dehub.io/newpost/1051', 'A post', 'feed-simple');
  expect(download).toHaveBeenCalledWith('https://dehub.io/_og/post/v2/6501.png', 'file:///cache/dehub-post-6501.png');
  expect(share).toHaveBeenCalledWith({ url: 'file:///cache/dehub-post-6501.png', message: 'A post\nhttps://dehub.io/newpost/1051' });
});

it('uses a URL fallback if a post is restricted or the renderer is unavailable', async () => {
  download.mockResolvedValue({ status: 404, headers: { 'content-type': 'text/plain' } });
  await sharePostAsImage(6501, 'https://dehub.io/newpost/1051', undefined, 'feed-simple');
  expect(share).toHaveBeenCalledWith({ message: 'https://dehub.io/newpost/1051', url: 'https://dehub.io/newpost/1051' });
});

it('does not attach an HTML error page as a PNG', async () => {
  download.mockResolvedValue({ status: 200, headers: { 'content-type': 'text/html' } });
  await sharePostAsImage(6501, 'https://dehub.io/newpost/1051', undefined, 'feed-simple');
  expect(share.mock.calls[0][0].url).toBe('https://dehub.io/newpost/1051');
});

it('keeps the existing media renderer for image/video posts', async () => {
  download.mockResolvedValue({ status: 200, headers: { 'content-type': 'image/png' } });
  await sharePostAsImage(12, 'https://dehub.io/app/post/12', undefined, 'video');
  expect(download.mock.calls[0][0]).toBe('https://api.dehub.io/og-image/12');
});

it('shares the canonical link on Android without downloading an unused card', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  await sharePostAsImage(6501, 'https://dehub.io/newpost/1051', 'A post', 'feed-simple');
  expect(download).not.toHaveBeenCalled();
  expect(share).toHaveBeenCalledWith({ message: 'A post\nhttps://dehub.io/newpost/1051' });
});

it('rejects identifiers that could change the image route', () => {
  expect(() => getTextPostShareImageUrl('../private')).toThrow('Invalid post id');
});
