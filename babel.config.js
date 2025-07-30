module.exports = function (api) {
  api.cache(true);
  return {
    // ignore: ["**/*.css"],
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      "react-native-reanimated/plugin",
    ],
  };
};
