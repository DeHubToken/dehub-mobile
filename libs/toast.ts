import { toast } from 'sonner-native';
import { toastTheme } from '../theme/toastTheme';

// Normalize unknown error shapes to a string message
function extractMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || 'Error';
  // API error objects
  // @ts-ignore
  if (err.message) return String(err.message);
  try { return JSON.stringify(err); } catch { return 'Unexpected error'; }
}

const base = (message: string, opts?: Parameters<typeof toast>[1]) => {
  return toast(message, { ...opts });
};

export const toastSuccess = (message: string, opts?: Parameters<typeof toast.success>[1]) =>
  toast.success(message, { ...opts });

export const toastError = (error: unknown, fallback = 'Something went wrong', opts?: Parameters<typeof toast.error>[1]) => {
  const message = extractMessage(error) || fallback;
  return toast.error(message, { ...opts });
};

export const toastInfo = (message: string, opts?: Parameters<typeof toast>[1]) =>
  base(message, opts);

export const toastWarning = (message: string, opts?: Parameters<typeof toast.warning>[1]) =>
  toast.warning(message, { ...opts });

export const toastPromise = <T,>(p: Promise<T>, msgs: { loading: string; success: string | ((data: T) => string); error: string; }) => {
  return toast.promise(p, {
    loading: msgs.loading,
    success: (data: T) => typeof msgs.success === 'function' ? msgs.success(data) : msgs.success,
    error: msgs.error,
  });
};
