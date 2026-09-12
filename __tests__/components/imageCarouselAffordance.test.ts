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

describe('image carousel navigation affordance', () => {
  it('renders a compact, control-free horizontal image strip', () => {
    expect(feedCard).toMatch(/marginRight: index === galleryImages\.length - 1 \? 0 : 8/);
    expect(feedCard).toMatch(/<ContainedFeedImage[\s\S]*?compact/);
    expect(containedFeedImage).toMatch(/width: compact \? dimensions\.width/);
    expect(feedCard).not.toMatch(/accessibilityLabel="Previous image"/);
    expect(feedCard).not.toMatch(/accessibilityLabel="Next image"/);
    expect(feedCard).not.toMatch(/activeImageIndex/);
  });
});
