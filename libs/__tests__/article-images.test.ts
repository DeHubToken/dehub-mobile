import {
  ARTICLE_IMAGE_LINE, ARTICLE_IMAGE_MAX, articleImageSize, articleImages, articleTextLength, insertArticleImage,
  removeArticleImage, setArticleImageCaption,
} from '../article';

const url = 'https://cdn.dehub.io/article-images/a.jpg#w=1200&h=800';

describe('article images', () => {
  it('inserts a picture on its own lines and moves the cursor past it', () => {
    const { body, cursor } = insertArticleImage('First.\nSecond.', 6, url);
    expect(body).toBe(`First.\n\n![](${url})\n\nSecond.`);
    expect(body.slice(cursor)).toBe('Second.');
    expect(ARTICLE_IMAGE_LINE.test(`![](${url})`)).toBe(true);
  });

  it('captions and removes', () => {
    const body = insertArticleImage('Text here.', 10, url).body;
    const captioned = setArticleImageCaption(body, 0, 'A [bay]\nat dusk');
    expect(articleImages(captioned)[0].caption).toBe('A bay at dusk');
    expect(removeArticleImage(captioned, 0)).toBe('Text here.\n\n');
  });

  it('leaves picture markup out of the text length and reads size', () => {
    expect(articleTextLength(`Hello\n\n![cap](${url})`)).toBe(5);
    expect(articleImageSize(url)).toEqual({ w: 1200, h: 800 });
    expect(ARTICLE_IMAGE_MAX).toBe(40);
  });
});
