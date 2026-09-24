module.exports = function (api) {
  api.cache(true);
  return {
    // ignore: ["**/*.css"],
    presets: [
      [
        "babel-preset-expo",
        {
          jsxImportSource: "nativewind",
          unstable_transformImportMeta: true,
        },
      ],
      "nativewind/babel",
    ],
    plugins: [
      // Plugins run before presets, so this is the JSX transform that wins.
      // "nativewind/babel" brings its own pointed at react-native-css-interop,
      // which is why jsxImportSource above never took effect. "dehub-jsx" is
      // that same runtime with the minimal theme's shape pass in front — see
      // libs/jsx/jsx-runtime.js.
      [
        "@babel/plugin-transform-react-jsx",
        { runtime: "automatic", importSource: "dehub-jsx" },
      ],
      "module:react-native-dotenv",
      // Reanimated 4: plugin moved to react-native-worklets
      "react-native-worklets/plugin",
    ],
  };
};
