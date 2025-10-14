import { Buffer } from "buffer";
import { createLogger } from './libs/logger';

if (!global.Buffer) {
  // Assign Buffer polyfill
  // @ts-ignore
  global.Buffer = Buffer;
}

// Provide __dirname / __filename shims if missing
// @ts-ignore
if (typeof __dirname === 'undefined') global.__dirname = '/';
// @ts-ignore
if (typeof __filename === 'undefined') global.__filename = '';

// eslint-disable-next-line import/first
import { install } from "react-native-quick-crypto";

// Avoid double install
try {
  // @ts-ignore
  if (!global.__QUICK_CRYPTO_INSTALLED__) {
    install();
    // @ts-ignore
    global.__QUICK_CRYPTO_INSTALLED__ = true;
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[globals] quick-crypto install failed', e);
}

// Needed so that 'stream-http' chooses the right default protocol.
// Minimal location polyfill (only protocol needed). Cast to any to bypass DOM type requirements.
// @ts-ignore
global.location = {
  protocol: 'file:',
};

if (!global.crypto) {
  // @ts-ignore
  global.crypto = require('react-native-quick-crypto').crypto;
}

// Base64 helpers expected by some SDK internals (e.g., Web3Auth)
if (typeof (global as any).base64FromArrayBuffer !== 'function') {
  (global as any).base64FromArrayBuffer = (arrayBuffer: ArrayBuffer): string => {
    try {
      return Buffer.from(arrayBuffer).toString('base64');
    } catch (e) {
      console.warn('[globals] base64FromArrayBuffer failed', e);
      return '';
    }
  };
}

if (typeof (global as any).arrayBufferFromBase64 !== 'function') {
  (global as any).arrayBufferFromBase64 = (b64: string): ArrayBuffer => {
    try {
      const buf = Buffer.from(b64, 'base64');
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch (e) {
      console.warn('[globals] arrayBufferFromBase64 failed', e);
      return new ArrayBuffer(0);
    }
  };
}

// Some libs expect base64ToArrayBuffer instead of arrayBufferFromBase64; provide alias.
if (typeof (global as any).base64ToArrayBuffer !== 'function') {
  (global as any).base64ToArrayBuffer = (b64: string): ArrayBuffer => {
    try {
      return (global as any).arrayBufferFromBase64
        ? (global as any).arrayBufferFromBase64(b64)
        : Buffer.from(b64, 'base64').buffer;
    } catch (e) {
      console.warn('[globals] base64ToArrayBuffer failed', e);
      return new ArrayBuffer(0);
    }
  };
}

try {
  // @ts-ignore
  global.process = global.process || require('process');
  // Ensure version exists (some libs expect semver string)
  // @ts-ignore
  if (!global.process.version) {
    // @ts-ignore
    global.process.version = 'v16.0.0';
  }
} catch (e) {
  console.warn('[globals] process polyfill failed', e);
}

// Copy over any missing process props from base process module (for shims expecting full object)
try {
  const baseProcess = require('process');
  Object.keys(baseProcess).forEach((k) => {
    // @ts-ignore
    if (!(k in process)) (process as any)[k] = (baseProcess as any)[k];
  });
} catch {}

// NODE_ENV / debug flags
const isDev = typeof __DEV__ === 'boolean' && __DEV__;
process.env = process.env || {};
Object.assign(process.env, {
  NODE_ENV: isDev ? 'development' : 'production',
});
try {
  // Optional localStorage debug flag (ignored in RN but harmless if polyfilled)
  if (typeof localStorage !== 'undefined') {
    // (localStorage as any).debug = isDev ? '*' : '';
    (localStorage as any).debug = '';
  }
} catch {}

// @ts-ignore
process.browser = true; // Some libs test this flag

// TextEncoder / TextDecoder polyfill (used by certain encoding libs)
try {
  if (typeof (global as any).TextEncoder === 'undefined' || typeof (global as any).TextDecoder === 'undefined') {
    const TextEncodingPolyfill = require('text-encoding');
    (global as any).TextEncoder = TextEncodingPolyfill.TextEncoder;
    (global as any).TextDecoder = TextEncodingPolyfill.TextDecoder;
  }
} catch (e) {
  console.warn('[globals] text-encoding polyfill failed', e);
}

// Debug sample (can be commented out after validation)
try {
  // eslint-disable-next-line no-console
  const gLog = createLogger('globals');
  gLog.debug('base64 test', Buffer.from('Hello World!', 'utf-8').toString('base64'));
} catch {}


import { BackHandler } from "react-native";

// BackHandler compatibility shim: support legacy removeEventListener('hardwareBackPress', handler)
// New RN API returns a subscription from addEventListener; call subscription.remove().
// Some transitive deps still call the legacy remove API, which is undefined on newer RN.
(() => {
	const bh: any = BackHandler as any;
	const originalAdd = bh.addEventListener?.bind(BackHandler);
	if (!originalAdd) return;

	// Track handler -> subscription so we can remove by handler later
	if (!bh.__handlerMap) bh.__handlerMap = new Map();

	// Wrap addEventListener to store mapping
	bh.addEventListener = (eventName: string, handler: any) => {
		const sub = originalAdd(eventName, handler);
		try {
			if (handler) bh.__handlerMap.set(handler, sub);
		} catch {}
		return sub;
	};

	// Provide legacy removeEventListener implementation if missing or not a function
	if (typeof bh.removeEventListener !== "function") {
		bh.removeEventListener = (eventName: string, handler: any) => {
			try {
				const sub = handler && bh.__handlerMap.get(handler);
				if (sub && typeof sub.remove === "function") {
					sub.remove();
					bh.__handlerMap.delete(handler);
					return;
				}
				// Fallback: if a subscription-like object is passed
				if (handler && typeof handler.remove === "function") {
					handler.remove();
				}
			} catch {}
		};
	}
})();