import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '../../libs/storage';
import { mirrorDurable, restoreDurable } from '../../libs/durable-setting';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('durable settings', () => {
  beforeEach(async () => {
    storage.clearAll();
    await AsyncStorage.clear();
  });

  it('puts back a choice MMKV lost and says so', async () => {
    mirrorDurable('riftn.notifications.showCount', true);
    await flush();
    const restored = jest.fn();
    await restoreDurable('riftn.notifications.showCount', 'boolean', restored);
    expect(storage.getBoolean('riftn.notifications.showCount')).toBe(true);
    expect(restored).toHaveBeenCalledTimes(1);
  });

  it('leaves a value MMKV still has alone and seeds its copy', async () => {
    storage.set('ai-third-party-consent', 'off');
    const restored = jest.fn();
    await restoreDurable('ai-third-party-consent', 'string', restored);
    await flush();
    expect(restored).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('durable:ai-third-party-consent')).toBe('"off"');
  });

  it('ignores a copy of the wrong kind', async () => {
    await AsyncStorage.setItem('durable:ai-third-party-consent', 'true');
    const restored = jest.fn();
    await restoreDurable('ai-third-party-consent', 'string', restored);
    expect(storage.getString('ai-third-party-consent')).toBeUndefined();
    expect(restored).not.toHaveBeenCalled();
  });
});
