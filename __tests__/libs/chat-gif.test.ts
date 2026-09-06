import { resolveChatGif, gifCaption, chatBodyText, gifBox, isBareUrl } from '../../libs/chat-gif';

const TENOR = 'https://media.tenor.com/74ETHgpJgg8AAAAC/borat-very-nice.gif';
const GIPHY = 'https://media3.giphy.com/media/v1.abc/89x4osEodHEoo/200w.gif';

/** What mobile writes: a gif object, no body. */
const mobileGif = {
  content: '',
  messageType: 'gif',
  gif: { url: TENOR, previewUrl: TENOR, width: 240, height: 180 },
};

/** What web's public chat writes: the URL as the body, mirrored into media. */
const webGif = {
  content: GIPHY,
  messageType: 'gif',
  media: [{ url: GIPHY, type: 'image' }],
};

/** What web's sidebar chat writes: the URL as the body and nothing else. */
const sidebarGif = { content: GIPHY, messageType: 'gif' };

describe('resolveChatGif', () => {
  it('reads the gif object mobile sends', () => {
    expect(resolveChatGif(mobileGif)).toEqual({ url: TENOR, width: 240, height: 180 });
  });

  it('reads the mirrored media entry web sends', () => {
    expect(resolveChatGif(webGif)).toEqual({ url: GIPHY });
  });

  it('falls back to the URL in the body when that is all there is', () => {
    expect(resolveChatGif(sidebarGif)).toEqual({ url: GIPHY });
  });

  it('leaves a plain text message alone', () => {
    expect(resolveChatGif({ content: 'look at this https://dehub.io', messageType: 'text' })).toBeNull();
  });

  it('does not turn a link someone typed into a picture', () => {
    expect(resolveChatGif({ content: 'https://dehub.io/apk', messageType: 'text' })).toBeNull();
  });

  it('ignores a body that is not a URL even on a gif message', () => {
    expect(resolveChatGif({ content: 'very nice', messageType: 'gif' })).toBeNull();
  });

  it('drops sizes that would break a layout', () => {
    const gif = resolveChatGif({ messageType: 'gif', gif: { url: TENOR, width: 0, height: NaN } });
    expect(gif).toEqual({ url: TENOR, width: undefined, height: undefined });
  });
});

describe('gifCaption', () => {
  it('drops the URL web puts in the body', () => {
    expect(gifCaption(webGif, resolveChatGif(webGif))).toBe('');
    expect(gifCaption(sidebarGif, resolveChatGif(sidebarGif))).toBe('');
  });

  it('drops a mirrored media URL that is not the one drawn', () => {
    const message = { content: GIPHY, messageType: 'gif', gif: { url: TENOR }, media: [{ url: GIPHY }] };
    expect(gifCaption(message, resolveChatGif(message))).toBe('');
  });

  it('keeps a caption someone actually typed', () => {
    const message = { ...mobileGif, content: 'very nice' };
    expect(gifCaption(message, resolveChatGif(message))).toBe('very nice');
  });

  it('leaves a text message untouched', () => {
    const message = { content: 'https://dehub.io', messageType: 'text' };
    expect(gifCaption(message, resolveChatGif(message))).toBe('https://dehub.io');
  });
});

describe('chatBodyText', () => {
  it('drops the URL when it is the picture already on screen', () => {
    expect(chatBodyText({ content: GIPHY, message_type: 'gif', image_url: GIPHY })).toBe('');
  });

  it('drops a gif URL even with no image_url beside it', () => {
    expect(chatBodyText({ content: GIPHY, message_type: 'gif' })).toBe('');
  });

  it('keeps the caption on an uploaded image', () => {
    expect(chatBodyText({ content: 'my dog', message_type: 'image', image_url: GIPHY })).toBe('my dog');
  });

  it('keeps a link someone typed', () => {
    expect(chatBodyText({ content: 'https://dehub.io', message_type: 'text' })).toBe('https://dehub.io');
  });
});

describe('gifBox', () => {
  it('keeps the sender aspect ratio inside the box', () => {
    expect(gifBox({ url: TENOR, width: 480, height: 360 })).toEqual({ width: 240, height: 180 });
  });

  it('falls back to a fixed box when the sender gave no size', () => {
    expect(gifBox({ url: GIPHY })).toEqual({ width: 240, height: 180 });
  });

  it('never returns a NaN dimension', () => {
    const box = gifBox({ url: GIPHY, width: 200 });
    expect(Number.isFinite(box.width)).toBe(true);
    expect(Number.isFinite(box.height)).toBe(true);
  });

  it('caps a tall gif instead of letting it run down the screen', () => {
    expect(gifBox({ url: GIPHY, width: 100, height: 400 }).height).toBe(240);
  });
});

describe('isBareUrl', () => {
  it.each([GIPHY, TENOR, 'http://x.io/a.gif'])('accepts %s', (url) => {
    expect(isBareUrl(url)).toBe(true);
  });

  it.each(['', 'hello', 'see https://dehub.io now', 'dehub.io'])('rejects %s', (text) => {
    expect(isBareUrl(text)).toBe(false);
  });
});
