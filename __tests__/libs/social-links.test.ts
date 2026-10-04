import { normalizeSocialUrl } from '../../libs/social-links';

it.each([
  ['twitterLink', 'r2r_air', 'https://x.com/r2r_air'],
  ['instagramLink', '@r2r.officiel', 'https://instagram.com/r2r.officiel'],
  ['twitterLink', 'twitter.com/r2r_air', 'https://twitter.com/r2r_air'],
  ['youtubeLink', 'youtube.com/dehub', 'https://www.youtube.com/@dehub'],
  ['youtubeLink', 'youtube.com/channel/UC123', 'https://youtube.com/channel/UC123'],
  ['tiktokLink', 'dehub', 'https://tiktok.com/@dehub'],
  ['discordLink', 'discord.gg/dehub', 'https://discord.gg/dehub'],
])('opens %s value %s on its platform', (key, value, expected) => {
  expect(normalizeSocialUrl(key, value)).toBe(expected);
});
