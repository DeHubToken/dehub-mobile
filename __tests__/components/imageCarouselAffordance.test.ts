import { readFileSync } from 'fs';
import { resolve } from 'path';

const feedCard = readFileSync(
  resolve(__dirname, '../../components/Home/FeedCard.tsx'),
  'utf8',
);
const containedFeedImage = readFileSync(
  resolve(__dirname, '../../components/Home/ContainedFeedImage.tsx'),
  'utf8',
);
const gallery = readFileSync(resolve(__dirname, '../../components/Home/FeedImageGallery.tsx'), 'utf8');

describe('image carousel navigation affordance', () => {
  it('renders a compact, control-free horizontal image strip', () => {
    expect(gallery).toMatch(/marginRight: index === images\.length - 1 \? 0 : 8/);
    expect(gallery).toMatch(/<ContainedFeedImage[\s\S]*?compact/);
    expect(containedFeedImage).toMatch(/width: compact \? dimensions\.width/);
    expect(feedCard).not.toMatch(/accessibilityLabel="Previous image"/);
    expect(feedCard).not.toMatch(/accessibilityLabel="Next image"/);
    expect(feedCard).not.toMatch(/activeImageIndex/);
  });
});
