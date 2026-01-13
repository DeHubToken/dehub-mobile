
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

module.exports = withNativeWind(config, { input: './global.css' });
