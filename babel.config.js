module.exports = function (api) {
  api.cache(true);
  return {
    // ignore: ["**/*.css"],
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: ["module:react-native-dotenv", "react-native-reanimated/plugin"],
  };
};
