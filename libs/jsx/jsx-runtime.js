/**
 * The app's JSX runtime: NativeWind's, with the minimal theme's shape pass
 * (./shape.js) in front of it. Wired as `jsxImportSource: "dehub-jsx"` in
 * babel.config.js and resolved to this folder by metro.config.js and
 * jest.config.js.
 */
const base = require("nativewind/jsx-runtime");
const { themedType } = require("./themed-shape");

function wrap(fn) {
  return function (type, props, ...rest) {
    const shaped = props && (props.style !== undefined || props.imageStyle !== undefined);
    return fn(shaped ? themedType(type, base.jsx) : type, props, ...rest);
  };
}

module.exports = {
  ...base,
  jsx: wrap(base.jsx),
  jsxs: wrap(base.jsxs),
  Fragment: base.Fragment,
};
