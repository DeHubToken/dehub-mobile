module.exports = function (api) {
  api.cache(true);
  return {
    // ignore: ["**/*.css"],
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      "module:react-native-dotenv",
      // Reanimated 4: plugin moved to react-native-worklets
      "react-native-worklets/plugin",
    ],
  };
};
