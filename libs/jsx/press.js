/**
 * Pressed feedback without NativeWind's `active:` state.
 *
 * NativeWind turns `active:` on from onPressIn and off from onPressOut. When a
 * scroll steals the touch (a finger landing on a row to scroll a sheet), the
 * off never arrives, so the row keeps its pressed fill, and the control
 * material (./controls.js) then paints it as a boxed card. Every drawer row
 * the thumb started a scroll on stayed boxed.
 *
 * So `active:` classes on a pressable come off before NativeWind sees them:
 * a Pressable gets the same look from its own `pressed` state, and a
 * TouchableOpacity keeps its own opacity feedback (`active:opacity-N` becomes
 * its activeOpacity).
 */
const ACTIVE = /(?:^|\s)active:(\S+)/g;
let pressable;

function pressedStyle(tokens) {
  const style = {};
  for (const token of tokens) {
    const opacity = /^opacity-(\d+)$/.exec(token);
    if (opacity) style.opacity = Number(opacity[1]) / 100;
    const fill = /^bg-(white|black)\/(\d+)$/.exec(token);
    if (fill) {
      const channel = fill[1] === "white" ? 255 : 0;
      style.backgroundColor = `rgba(${channel},${channel},${channel},${Number(fill[2]) / 100})`;
    }
  }
  return Object.keys(style).length ? style : null;
}

function pressProps(type, props) {
  if (!props || typeof props.className !== "string" || !props.className.includes("active:")) return props;
  if (typeof props.onPress !== "function" && typeof props.onPressIn !== "function") return props;
  const tokens = [];
  const className = props.className.replace(ACTIVE, (_, token) => {
    tokens.push(token);
    return "";
  }).trim();
  const pressed = pressedStyle(tokens);
  const next = { ...props, className };
  if (!pressed) return next;
  pressable ??= require("react-native").Pressable;
  if (type === pressable) {
    const own = props.style;
    next.style = (state) => {
      const base = typeof own === "function" ? own(state) : own;
      return state.pressed ? [base, pressed] : base;
    };
  }
  // Ignored by a Pressable; a TouchableOpacity dims by it.
  if (pressed.opacity !== undefined && props.activeOpacity === undefined) next.activeOpacity = pressed.opacity;
  return next;
}

module.exports = { pressProps };
