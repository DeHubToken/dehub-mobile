import { classifyDevice } from '../deviceTier';

const GB = 1024 * 1024 * 1024;

describe('classifyDevice', () => {
  it('leaves iPhones alone', () => {
    expect(classifyDevice('ios', 15, 2 * GB)).toBe('full');
  });
  it('treats Android 11 and older as low-end', () => {
    expect(classifyDevice('android', 30, 8 * GB)).toBe('low');
    expect(classifyDevice('android', 29, null)).toBe('low');
  });
  it('treats 4GB phones as low-end on any Android version', () => {
    expect(classifyDevice('android', 34, 3.6 * GB)).toBe('low');
  });
  it('drops the theme scene on 3GB phones', () => {
    expect(classifyDevice('android', 33, 2.8 * GB)).toBe('veryLow');
  });
  it('keeps newer phones as they are', () => {
    expect(classifyDevice('android', 34, 11 * GB)).toBe('full');
    expect(classifyDevice('android', 31, 5.5 * GB)).toBe('full');
    expect(classifyDevice('android', 33, null)).toBe('full');
  });
});
