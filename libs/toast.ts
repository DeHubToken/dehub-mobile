import React from 'react';
import { toast } from 'sonner-native';
import GlassToast, { GlassToastProps } from '../components/ui/GlassToast';

// Normalize unknown error shapes to a string message
function extractMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || 'Error';
  // API error objects
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String(err.message);
  }
  try { 
    return JSON.stringify(err); 
  } catch { 
    return 'Unexpected error'; 
  }
}

// Extended options that include GlassToast-specific props
interface ToastOptions extends Omit<Parameters<typeof toast>[1], 'description'> {
  description?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  dismissible?: boolean; // Whether to show close button
}

// Create a glass toast with proper prop handling
const createGlassToast = (
  type: any,
  message: string,
  options?: ToastOptions
) => {
  const { description, actionLabel, onActionPress, dismissible = true, ...sonnerOpts } = options || {};
  
  return toast.custom(
    React.createElement(GlassToast, {
      title: message,
      type,
      description,
      actionLabel,
      onActionPress,
      onClose: dismissible ? () => toast.dismiss(sonnerOpts.id) : undefined,
    }),
    sonnerOpts
  );
};

// Base toast function
export const toastInfo = (message: string, options?: ToastOptions) => {
  return createGlassToast('info', message, options);
};

// Success toast
export const toastSuccess = (message: string, options?: ToastOptions) => {
  return createGlassToast('success', message, options);
};

// Error toast with better error handling
export const toastError = (
  error: unknown, 
  fallback = 'Something went wrong', 
  options?: ToastOptions
) => {
  const message = extractMessage(error) || fallback;
  return createGlassToast('error', message, options);
};

// Warning toast
export const toastWarning = (message: string, options?: ToastOptions) => {
  return createGlassToast('warning', message, options);
};

// Loading toast (usually not dismissible by default)
export const toastLoading = (message: string, options?: Omit<ToastOptions, 'dismissible'> & { dismissible?: boolean }) => {
  return createGlassToast('loading', message, { dismissible: false, ...options });
};

// Promise toast with proper lifecycle management
export const toastPromise = <T,>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error?: string | ((error: unknown) => string);
  },
  options?: ToastOptions
) => {
  // Generate a unique ID for this promise toast
  const id = `promise-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  // Show loading toast
  createGlassToast('loading', messages.loading, {
    ...options,
    id,
    dismissible: false, // Loading states shouldn't be dismissible
    duration: Infinity, // Keep loading toast until promise resolves
  });

  return promise
    .then((data) => {
      const successMessage = typeof messages.success === 'function' 
        ? messages.success(data) 
        : messages.success;
      
      createGlassToast('success', successMessage, {
        ...options,
        id, // Replace the loading toast
        dismissible: true,
      });
      
      return data;
    })
    .catch((err) => {
      let errorMessage: string;
      
      if (messages.error) {
        errorMessage = typeof messages.error === 'function'
          ? messages.error(err)
          : messages.error;
      } else {
        errorMessage = extractMessage(err);
      }
      
      createGlassToast('error', errorMessage, {
        ...options,
        id, // Replace the loading toast
        dismissible: true,
      });
      
      throw err; // Re-throw to maintain promise chain
    });
};

// Utility functions for common patterns
export const toastWithAction = (
  type: any,
  message: string,
  actionLabel: string,
  onActionPress: () => void,
  options?: Omit<ToastOptions, 'actionLabel' | 'onActionPress'>
) => {
  return createGlassToast(type, message, {
    ...options,
    actionLabel,
    onActionPress,
  });
};

// Dismiss all toasts
export const dismissAllToasts = () => toast.dismiss();

// Dismiss specific toast
export const dismissToast = (id: string | number) => toast.dismiss(id);

// Default export for backward compatibility
export default {
  info: toastInfo,
  success: toastSuccess,
  error: toastError,
  warning: toastWarning,
  loading: toastLoading,
  promise: toastPromise,
  withAction: toastWithAction,
  dismiss: dismissToast,
  dismissAll: dismissAllToasts,
};