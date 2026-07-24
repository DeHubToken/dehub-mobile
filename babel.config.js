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
      "module:react-native-dotenv",
      // Reanimated 4: plugin moved to react-native-worklets
      "react-native-worklets/plugin",
    ],
  };
};
