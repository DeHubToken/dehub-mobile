import fs from 'fs';
import path from 'path';
import { replyIdOf } from '../../libs/reply-delivery';

describe('replyIdOf', () => {
  it('reads the id POST /request_comment answers with', () => {
    expect(replyIdOf({ result: true, commentId: 4821 })).toBe(4821);
  });

  it('still reads the nested and flat shapes', () => {
    expect(replyIdOf({ result: { id: 7 } })).toBe(7);
    expect(replyIdOf({ id: 9 })).toBe(9);
    expect(replyIdOf({ result: true })).toBeUndefined();
  });

  // A posted comment that keeps its temporary id stays "sending", and a
  // sending row ignores the long-press, so your own new reply had no menu.
  it('is how the comment drawer swaps the temporary id for the real one', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../components/Comments/CommentSection.tsx'),
      'utf8',
    );
    expect(src).not.toContain('res?.result?.id ?? res?.id');
    expect(src).toContain('replyIdOf(res)');
  });
});
