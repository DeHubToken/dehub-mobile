// Generic WebSocket event typing (no domain-specific livestream logic)
export type GenericHandler<T = any> = (data: T) => void;
export type WSCoreEvents = 'connected' | 'disconnected' | 'connect_error';
