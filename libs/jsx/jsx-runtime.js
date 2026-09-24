/**
 * The app's JSX runtime: NativeWind's, with the minimal theme's shape pass
 * (./shape.js) in front of it. Wired as `jsxImportSource: "dehub-jsx"` in
 * babel.config.js and resolved to this folder by metro.config.js and
 * jest.config.js.
 */
const base = require("nativewind/jsx-runtime");
const { squareProps } = require("./shape");

function wrap(fn) {
  return function (type, props, ...rest) {
    return fn(type, squareProps(props), ...rest);
  };
}

module.exports = {
  ...base,
  jsx: wrap(base.jsx),
  jsxs: wrap(base.jsxs),
  Fragment: base.Fragment,
};
