import { Dimensions, Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export type PageBugContext = { screen: string; capturedAt: string; device: string; model: string; os: string; version: string; update: string; viewport: string };
export function bugScreenLabel(route?: { name: string; params?: object }) {
  if (!route) return 'App';
  // Only public content identifiers; navigation params can also hold private drafts.
  if (/chat|message|dm|auth|wallet|settings/i.test(route.name)) return route.name;
  const params = route.params as Record<string, unknown> | undefined;
  const identity = ['tokenId', 'postId', 'communityId', 'storeId', 'username']
    .filter(key => typeof params?.[key] === 'string' || typeof params?.[key] === 'number')
    .map(key => `${key}=${String(params![key]).slice(0, 120)}`).join(', ');
  return identity ? `${route.name} (${identity})` : route.name;
}
export function pageBugContext(screen: string): PageBugContext {
  const { width, height, scale } = Dimensions.get('window');
  return {
    screen, capturedAt: new Date().toISOString(),
    device: [Device.brand, Device.manufacturer].filter(Boolean).join(' / ') || Platform.OS,
    model: Device.modelName || Device.modelId || 'Unknown',
    os: `${Device.osName || Platform.OS} ${Device.osVersion || Platform.Version}`,
    version: Constants.expoConfig?.version || 'Unknown', update: Updates.updateId || 'Embedded bundle',
    viewport: `${width} × ${height} @${scale}`,
  };
}
export function describePageBug(message: string, context: PageBugContext) {
  return `${message.trim()}\n\nScreen: ${context.screen}\nReported: ${context.capturedAt}\nDevice: ${context.device}\nModel: ${context.model}\nOS: ${context.os}\nApp: ${context.version}\nUpdate: ${context.update}\nViewport: ${context.viewport}`;
}
