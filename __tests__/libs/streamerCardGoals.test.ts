
import { STREAMER_BADGE_IDS } from '../../libs/streamer-badge-art';
import { STREAMER_CARD_GOALS, streamerCardProgress } from '../../libs/streamerCardGoals';
import type { StreamerProgress } from '../../services/live.service';

const progress: StreamerProgress = {
  selectedBadgeId: null,
  xp: 900,
  level: 5,
  nextLevelXp: 1260,
  levelStartXp: 900,
  progressToNext: 0,
  qualifyingMinutes: 150,
  qualifyingStreams: 7,
  totalStreams: 9,
  longestStreamMinutes: 95,
  currentStreakWeeks: 2,
  bestStreakWeeks: 3,
  cards: [],
  recent: [],
};

describe('streamer card goals', () => {
  it('gives every card a goal', () => {
    for (const id of STREAMER_BADGE_IDS) expect(STREAMER_CARD_GOALS[id]).toBeTruthy();
  });

  it('reads each running total from the progress payload', () => {
    expect(streamerCardProgress('on-air', progress)).toEqual({ metric: 'streams', current: 7, target: 10 });
    expect(streamerCardProgress('century', progress)).toEqual({ metric: 'hours', current: 2.5, target: 100 });
    expect(streamerCardProgress('marathon', progress)).toEqual({ metric: 'session', current: 95, target: 120 });
    expect(streamerCardProgress('regular', progress)).toEqual({ metric: 'streak', current: 3, target: 4 });
    expect(streamerCardProgress('legend', progress)).toEqual({ metric: 'level', current: 5, target: 10 });
  });

  it('shows no bar for cards the payload has no total for', () => {
    expect(streamerCardProgress('crowd', progress)).toBeNull();
    expect(streamerCardProgress('night-owl', progress)).toBeNull();
    expect(streamerCardProgress('on-air', undefined)).toBeNull();
  });
});
