import { beginAuthTrace, advanceAuthTrace, clearAuthTrace, readAuthTrace } from '../../libs/auth-trace';

afterEach(clearAuthTrace);

it('correlates method retries without carrying the previous identity', () => {
  beginAuthTrace('undecided');
  const opened = readAuthTrace();
  beginAuthTrace('email');
  advanceAuthTrace('identity-established', 'first-user');
  const email = readAuthTrace();
  beginAuthTrace('google');
  expect(readAuthTrace().auth_flow_id).toBe(opened.auth_flow_id);
  expect(readAuthTrace().auth_attempt_id).not.toBe(email.auth_attempt_id);
  expect(readAuthTrace().supabase_user_id).toBeUndefined();
  clearAuthTrace();
  beginAuthTrace('undecided');
  expect(readAuthTrace().auth_flow_id).not.toBe(opened.auth_flow_id);
});
