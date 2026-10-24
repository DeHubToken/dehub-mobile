
import { observeCommentCount, readCommentCount, updateCommentCount } from '../comment-count-store';

describe('shared reply counters', () => {
  it('increments immediately and survives a stale feed remount', () => {
    observeCommentCount('instant-reply', 0);
    updateCommentCount('instant-reply', 1);
    expect(readCommentCount('instant-reply')).toBe(1);
    observeCommentCount('instant-reply', 0);
    expect(readCommentCount('instant-reply')).toBe(1);
    observeCommentCount('instant-reply', 1);
    expect(readCommentCount('instant-reply')).toBe(1);
  });

  it('rolls back one failed send without removing another successful reply', () => {
    observeCommentCount('overlapping-replies', 5);
    updateCommentCount('overlapping-replies', 1);
    updateCommentCount('overlapping-replies', 1);
    updateCommentCount('overlapping-replies', -1);
    expect(readCommentCount('overlapping-replies')).toBe(6);
    expect(readCommentCount('another-post', 12)).toBe(12);
  });

  it('removes a reply subtree immediately and restores it on failure', () => {
    observeCommentCount('deleted-thread', 5);
    updateCommentCount('deleted-thread', -3);
    observeCommentCount('deleted-thread', 5);
    expect(readCommentCount('deleted-thread')).toBe(2);
    updateCommentCount('deleted-thread', 3);
    expect(readCommentCount('deleted-thread')).toBe(5);
  });
});
