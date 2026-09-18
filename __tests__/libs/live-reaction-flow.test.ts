
import { ReactionFlowQueue, liveReactionType, REACTION_STEP_MS } from '../../libs/live-reaction-flow';

function drain(queue: ReactionFlowQueue) {
  const seen = new Map<string, string>();
  for (let now = 0; queue.busy && now < 120000; now += REACTION_STEP_MS) {
    const particles = queue.tick(now);
    expect(particles.length).toBeLessThanOrEqual(24);
    particles.forEach(item => seen.set(item.id, item.type));
  }
  expect(queue.busy).toBe(false);
  return [...seen.values()];
}

describe('live reaction flow', () => {
  it('paces every click into several particles without replacing another viewer', () => {
    const queue = new ReactionFlowQueue();
    queue.enqueue('love');
    queue.enqueue('LIKE');
    expect(queue.tick(0).map(item => item.type)).toEqual(['HEART']);
    expect(drain(queue)).toEqual(['HEART', 'HEART', 'HEART', 'LIKE', 'LIKE', 'LIKE']);
  });
  it('gives badge holders more particles while keeping their size and lifetime unchanged', () => {
    const ordinary = new ReactionFlowQueue();
    const badge = new ReactionFlowQueue();
    ordinary.enqueue('HEART');
    badge.enqueue('HEART', 14);
    expect(drain(ordinary)).toHaveLength(3);
    expect(drain(badge)).toHaveLength(11);
  });
  it('handles a busy audience with bounded simultaneous particles and no lost normal clicks', () => {
    const queue = new ReactionFlowQueue();
    for (let i = 0; i < 100; i++) queue.enqueue(i % 2 ? 'LIKE' : 'HEART');
    expect(drain(queue)).toHaveLength(300);
  });
  it('clears pending and flying particles when the room ends or changes', () => {
    const queue = new ReactionFlowQueue();
    queue.enqueue('HOT', 14);
    queue.tick(0);
    queue.clear();
    expect(queue.busy).toBe(false);
    expect(queue.tick(200)).toEqual([]);
  });
  it('rejects unknown reactions and handles malformed badge weights', () => {
    expect(liveReactionType('respect')).toBe('SUPPORT');
    expect(liveReactionType('lol')).toBe('LAUGH');
    expect(liveReactionType('__proto__')).toBeNull();
    const queue = new ReactionFlowQueue();
    queue.enqueue('bad');
    expect(queue.busy).toBe(false);
    queue.enqueue('CRY', NaN);
    expect(drain(queue)).toHaveLength(3);
  });
});
