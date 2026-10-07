/**
 * The app's JSX runtime: NativeWind's, with the minimal theme's shape pass
 * (./shape.js) and the canvas themes' page/surface split (./surface.js) in
 * front of it. Wired as `jsxImportSource: "dehub-jsx"` in babel.config.js and
 * resolved to this folder by metro.config.js and jest.config.js.
 */
const base = require("nativewind/jsx-runtime");
const { controlProps } = require("./controls");
const { prepare } = require("./surface");
const { readableTextProps } = require("./readability");

function wrap(fn) {
  return function (type, props, ...rest) {
    const [t, p] = prepare(type, controlProps(readableTextProps(type, props)));
    return fn(t, p, ...rest);
  };
}

module.exports = {
  ...base,
  jsx: wrap(base.jsx),
  jsxs: wrap(base.jsxs),
  Fragment: base.Fragment,
};
