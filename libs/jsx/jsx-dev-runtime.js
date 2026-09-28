/** Dev twin of ./jsx-runtime.js — same shape pass in front of NativeWind's jsxDEV. */
const base = require("nativewind/jsx-dev-runtime");
const { themedType } = require("./themed-shape");
const renderElement = require("nativewind/jsx-runtime").jsx;

module.exports = {
  ...base,
  jsxDEV: function (type, props, ...rest) {
    const shaped = props && (props.style !== undefined || props.imageStyle !== undefined);
    return base.jsxDEV(shaped ? themedType(type, renderElement) : type, props, ...rest);
  },
  Fragment: base.Fragment,
};
