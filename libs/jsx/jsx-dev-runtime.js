/** Dev twin of ./jsx-runtime.js — same passes in front of NativeWind's jsxDEV. */
const base = require("nativewind/jsx-dev-runtime");
const { controlProps } = require("./controls");
const { prepare } = require("./surface");

module.exports = {
  ...base,
  jsxDEV: function (type, props, ...rest) {
    const [t, p] = prepare(type, controlProps(props));
    return base.jsxDEV(t, p, ...rest);
  },
  Fragment: base.Fragment,
};
