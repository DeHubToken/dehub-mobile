type AuthTrace = {
  auth_attempt_id: string;
  auth_method: string;
  auth_started_at: number;
  auth_stage: string;
  supabase_user_id?: string;
};

const MAX_AGE_MS = 30 * 60 * 1000;
let current: AuthTrace | null = null;

/** Correlation only: this id never authorizes a login or contains a credential. */
export function beginAuthTrace(method: string) {
  current = {
    auth_attempt_id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
    auth_method: method,
    auth_started_at: Date.now(),
    auth_stage: 'identity-start',
  };
}

export function readAuthTrace(): Record<string, unknown> {
  if (!current) return {};
  if (Date.now() - current.auth_started_at > MAX_AGE_MS) {
    clearAuthTrace();
    return {};
  }
  return { ...current, auth_elapsed_ms: Date.now() - current.auth_started_at };
}

export function advanceAuthTrace(stage: string, userId?: string) {
  readAuthTrace();
  if (!current) return;
  current.auth_stage = stage;
  if (userId) current.supabase_user_id = userId;
}

export function clearAuthTrace() {
  current = null;
}
