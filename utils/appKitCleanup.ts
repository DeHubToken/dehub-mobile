/**
 * Helper utility to clean up and manage AppKit listeners
 * to prevent EventEmitter memory leaks
 */

let cleanupFunctions: Array<() => void> = [];

/**
 * Register a cleanup function that will be called when cleanupAll is called
 * @param cleanupFn Function to call during cleanup
 */
export const registerCleanup = (cleanupFn: () => void): void => {
  cleanupFunctions.push(cleanupFn);
};

/**
 * Cleans up all registered cleanup functions
 * Call this when components unmount or when you want to reset listeners
 */
export const cleanupAll = (): void => {
  cleanupFunctions.forEach(fn => {
    try {
      fn();
    } catch (error) {
      console.error('Error during AppKit cleanup:', error);
    }
  });
  
  // Reset the array after cleanup
  cleanupFunctions = [];
};

/**
 * Attempts to increase max listeners for EventEmitter objects
 * to prevent the MaxListenersExceededWarning
 * @param emitter Any object with a setMaxListeners function
 * @param max Maximum number of listeners (default: 20)
 */
export const increaseMaxListeners = (
  emitter: { setMaxListeners?: (n: number) => void },
  max: number = 20
): void => {
  if (typeof emitter?.setMaxListeners === 'function') {
    emitter.setMaxListeners(max);
  }
};

/**
 * Helper to manage subscriptions
 * @param subscribe Function that creates a subscription and returns an unsubscribe function
 * @returns Cleanup function
 */
export const createManagedSubscription = (
  subscribe: () => (() => void) | undefined
): () => void => {
  const unsubscribe = subscribe();
  
  // Return cleanup function
  return () => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  };
};
