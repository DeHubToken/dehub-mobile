import { readFileSync } from 'fs';
import { resolve } from 'path';

const feedCard = readFileSync(
  resolve(__dirname, '../../components/Home/FeedCard.tsx'),
  'utf8',
);

describe('image carousel navigation affordance', () => {
  it('renders arrow controls for the fixed full-width gallery pages', () => {
    expect(feedCard).toMatch(/style=\{\{ width: itemWidth \}\}/);
    expect(feedCard).toMatch(/activeImageIndex > 0/);
    expect(feedCard).toMatch(/activeImageIndex < galleryImages\.length - 1/);
  });
});
