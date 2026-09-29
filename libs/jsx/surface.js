/**
 * Pages and the surfaces that float over them, under a canvas theme.
 *
 * A canvas theme veils page fills so its live backdrop shows through every
 * screen (./shape.js). A modal, sheet or drawer floats over a screen, not over
 * the backdrop, so the same veil there shows the screen underneath: text
 * behind text. Page fills on such a surface take the theme's solid page
 * colour instead.
 *
 * Which one an element gets depends on where it renders, and the pass cannot
 * see that when the element is created: a sheet's contents are created by the
 * screen that opens it, outside the Modal they end up in. So while a canvas
 * theme is on, an element with a page fill renders through PageFill, which
 * reads SolidSurface from its real place in the tree. Every react-native
 * Modal provides it, and so can a navigator screen presented over another
 * (SolidSurfaceScope).
 *
 * Plain JS for the same reason as ./shape.js.
 */
const React = require("react");
const { squareProps, routeProps, isVeiled, isPageFill } = require("./shape");

const SolidSurface = React.createContext(false);

// NativeWind's runtime, read on first use so screens can import
// SolidSurfaceScope without loading it (tests stub the runtime out).
let base;
function jsxAny(type, props) {
  if (!base) base = require("nativewind/jsx-runtime");
  return Array.isArray(props.children) ? base.jsxs(type, props) : base.jsx(type, props);
}

function SolidSurfaceScope({ children }) {
  return jsxAny(SolidSurface.Provider, { value: true, children });
}

const PageFill = React.forwardRef(function PageFill(props, ref) {
  const { __fillType: type, ...rest } = props;
  const solid = React.useContext(SolidSurface);
  const next = routeProps(squareProps(rest, solid));
  return jsxAny(type, ref ? { ...next, ref } : next);
});

// Read lazily: the JSX runtime loads before react-native does.
let modal;
function isModal(type) {
  if (modal === undefined) modal = require("react-native").Modal || null;
  return modal !== null && type === modal;
}

/** The type and props an element is really created with. */
function prepare(type, props) {
  if (props && isModal(type)) {
    props = { ...props, children: jsxAny(SolidSurface.Provider, { value: true, children: props.children }) };
  }
  if (isVeiled() && isPageFill(props)) {
    return [PageFill, { ...props, __fillType: type }];
  }
  return [type, routeProps(squareProps(props))];
}

module.exports = { SolidSurface, SolidSurfaceScope, PageFill, prepare };
