
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Base Expo config
const defaultConfig = getDefaultConfig(__dirname);

// Clone to avoid mutating Expo internals
const config = { ...defaultConfig };

// Ensure nested objects exist
config.resolver = config.resolver || {};

// Merge/augment resolver.extraNodeModules for Node core/polyfills required by Web3Auth & ethers
config.resolver.extraNodeModules = {
	...(config.resolver.extraNodeModules || {}),
	// Use actual polyfills where needed. Install missing ones if required.
	crypto: require.resolve('react-native-quick-crypto'),
	stream: (() => { try { return require.resolve('stream-browserify'); } catch { return require.resolve('readable-stream'); } })(),
	buffer: require.resolve('buffer'),
	assert: (() => { try { return require.resolve('assert'); } catch { return require.resolve('util'); } })(),
	// Fallback stubs (optional) – only add if build complains about these modules
	// os: require.resolve('empty-module'),
	// path: require.resolve('empty-module'),
};

// Keep SVGs as assets (we're using inline SVG XML, not transformer) – merge without dropping defaults
if (config.resolver.assetExts && !config.resolver.assetExts.includes('svg')) {
	config.resolver.assetExts.push('svg');
}

// Add Rive files as assets
if (config.resolver.assetExts && !config.resolver.assetExts.includes('riv')) {
	config.resolver.assetExts.push('riv');
}

// Ensure TypeScript/TSX supported (Expo already includes these; safeguard only)
if (config.resolver.sourceExts) {
	['cjs','mjs','js','jsx','ts','tsx'].forEach(ext => {
		if (!config.resolver.sourceExts.includes(ext)) config.resolver.sourceExts.push(ext);
	});
}

// Standard transform options
config.transformer = {
	...(config.transformer || {}),
	getTransformOptions: async () => ({
		transform: {
			experimentalImportSupport: true,
			inlineRequires: true,
		},
	}),
	// Strip dev logging from release bundles. There are ~430 raw `console.*`
	// calls across the app — `libs/logger.ts` is correctly gated on DEBUG, but
	// these are not — and each one is a real bridge call. The worst offenders
	// sit in hot paths: use-web3 (36), LiveProducerScreen (36), nft.service (28),
	// use-live (27).
	//
	// Routed through terser rather than babel-plugin-transform-remove-console so
	// this needs no new dependency and no lockfile change. Metro only minifies
	// release builds, so dev keeps every log.
	//
	// `pure_funcs` drops a call only where its return value is unused, so it
	// cannot alter control flow. error/warn are kept deliberately — they are the
	// crash breadcrumbs.
	minifierConfig: {
		...(config.transformer?.minifierConfig || {}),
		compress: {
			...(config.transformer?.minifierConfig?.compress || {}),
			pure_funcs: ['console.log', 'console.debug', 'console.info'],
		},
	},
	// If you later adopt a custom transformer (e.g., react-native-react-bridge), set babelTransformerPath here.
	// babelTransformerPath: require.resolve('react-native-react-bridge/lib/plugin'),
};

// ox/_cjs files use relative requires with explicit .js extensions (e.g.
// require("./core/PersonalMessage.js")). Metro's exports-map resolver checks
// those paths against ox's exports field and fails because they aren't listed
// as keys. Only ox internal paths need this bypass — everything else still goes
// through the normal exports-aware resolver so permissionless subpaths like
// "permissionless/accounts" correctly resolve to _cjs builds.
const _path = require('path');
const _fs = require('fs');

// @web3auth/react-native-sdk and @web3auth/no-modal both list "import"
// before "require" in their package.json "exports" map. With no explicit
// condition names configured, Metro falls back to whichever key appears
// FIRST, so it picks their dist/lib.esm builds — whose nested
// `import {...} from "@web3auth/no-modal"` then resolves to a broken/
// undefined module at runtime (login/init crashing with "Cannot read
// property 'CommonJRPCProvider'/'SMART_ACCOUNT_WALLET_SCOPE' of undefined").
// Forcing Metro's built-in "require" condition (via unstable_conditionNames)
// globally fixed this but broke an unrelated ESM-only package elsewhere in
// the bundle — so instead, force ONLY this package's CJS build, scoped by
// exact module name.
const _CJS_FORCED_PACKAGES = new Set(['@web3auth/react-native-sdk', '@web3auth/no-modal']);
function _resolveForcedCjsEntry(moduleName) {
	try {
		const pkgDir = _path.join(__dirname, 'node_modules', ...moduleName.split('/'));
		const pkgJsonPath = _path.join(pkgDir, 'package.json');
		const pkgJson = JSON.parse(_fs.readFileSync(pkgJsonPath, 'utf8'));
		const requireEntry = pkgJson.exports && pkgJson.exports['.'] && pkgJson.exports['.'].require;
		if (!requireEntry) return null;
		return _path.join(pkgDir, requireEntry);
	} catch {
		return null;
	}
}

// @web3auth/no-modal's barrel file unconditionally imports its
// MetaMask-browser-extension connector (metamaskConnector.js ->
// @metamask/connect-multichain -> the real Node `ws` package), even though
// this app only ever uses Web3Auth's social-login/DKG path and never that
// connector. `ws` (a real Node.js WebSocket client/server, not a
// browser-safe one) pulls in a long chain of Node core modules
// (zlib/http/https/net/tls/url) plus optional native addons
// (utf-8-validate -> node-gyp-build -> os) that don't exist in React Native.
// `extraNodeModules` can't stub these out -- it's only a FALLBACK Metro
// consults when normal resolution finds nothing, and both `ws` and
// `@metamask/connect-multichain` are real, physically-present packages, so
// normal resolution always wins and the fallback is never reached. Must
// intercept here in resolveRequest instead, which takes priority over any
// real package on disk. None of that subtree ever actually executes for us.
const _STUBBED_PACKAGES = new Set(['ws', '@metamask/connect-multichain']);
const _emptyModulePath = require.resolve('empty-module');

config.resolver.resolveRequest = (context, moduleName, platform) => {
	const origin = (context.originModulePath || '').replace(/\\/g, '/');
	if (origin.includes('/node_modules/ox/_cjs/') && moduleName.startsWith('./')) {
		const filePath = _path.resolve(_path.dirname(context.originModulePath), moduleName);
		if (_fs.existsSync(filePath)) {
			return { type: 'sourceFile', filePath };
		}
	}
	if (_CJS_FORCED_PACKAGES.has(moduleName)) {
		const filePath = _resolveForcedCjsEntry(moduleName);
		if (filePath && _fs.existsSync(filePath)) {
			return { type: 'sourceFile', filePath };
		}
	}
	if (_STUBBED_PACKAGES.has(moduleName)) {
		return { type: 'sourceFile', filePath: _emptyModulePath };
	}
	return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
