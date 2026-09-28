/** Dev twin of ./jsx-runtime.js — same shape pass in front of NativeWind's jsxDEV. */
const base = require("nativewind/jsx-dev-runtime");
const { squareProps, routeProps } = require("./shape");

module.exports = {
  ...base,
  jsxDEV: function (type, props, ...rest) {
    return base.jsxDEV(type, routeProps(squareProps(props)), ...rest);
  },
  Fragment: base.Fragment,
};
