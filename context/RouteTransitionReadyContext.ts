import { createContext } from 'react';

/** The route whose lightweight shell has already completed its entrance. */
export const RouteTransitionReadyContext = createContext<string | null>(null);
