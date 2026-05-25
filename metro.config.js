
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
	// http: require.resolve('empty-module'),
	// https: require.resolve('empty-module'),
	// os: require.resolve('empty-module'),
	// path: require.resolve('empty-module'),
	// zlib: require.resolve('empty-module'),
	// url: require.resolve('empty-module'),
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
config.resolver.resolveRequest = (context, moduleName, platform) => {
	const origin = (context.originModulePath || '').replace(/\\/g, '/');
	if (origin.includes('/node_modules/ox/_cjs/') && moduleName.startsWith('./')) {
		const filePath = _path.resolve(_path.dirname(context.originModulePath), moduleName);
		if (_fs.existsSync(filePath)) {
			return { type: 'sourceFile', filePath };
		}
	}
	return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
