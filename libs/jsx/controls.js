/** Neutral app actions inherit the active theme's existing control material. */
const React = require('react');
let material = null;
const NEUTRALS = new Set([
  '#000', '#000000', '#010305', '#09090b', '#0c0c0e', '#18181b', '#1c1c1c',
  '#1d1f21', '#27272a', '#2f2f2f', '#333333', '#383a3d', '#3f3f46',
  '#52525b', '#6f7174', '#71717a', '#8b8d90', '#a1a1aa', '#a6a9ac',
  '#aaaaaa', '#c2c4c7', '#d4d4d8', '#dde0e3', '#e4e4e7', '#f4f4f5',
  '#f9fbff', '#fafafa', '#fff', '#ffffff', 'white', 'black', 'silver',
]);
const NEUTRAL_FILL = /(?:^|\s)bg-(?:white|black|zinc-\d+|theme-neutrals-\d+)(?:\/[^\s]+)?(?=\s|$)/;
const DARK_TEXT = /(?:^|\s)text-(?:black|zinc-[789]00|theme-(?:background|neutrals-[789]00))(?=\s|$)/g;
let styleCache = new WeakMap();

function setControlMaterial(next) {
  if (next === material) return;
  material = next;
  styleCache = new WeakMap();
}

function neutral(color) {
  if (typeof color !== 'string') return false;
  const value = color.toLowerCase().replace(/\s/g, '');
  if (NEUTRALS.has(value)) return true;
  if (/^#[0-9a-f]{6}$/.test(value)) {
    const channels = [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
    if (Math.max(...channels) - Math.min(...channels) <= 10) return true;
  }
  const rgb = value.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/);
  return !!rgb && rgb[1] === rgb[2] && rgb[2] === rgb[3] && (rgb[4] === undefined || Number(rgb[4]) > 0);
}

function flatten(style) {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style && typeof style === 'object' ? style : {};
}

function paintStyle(style) {
  if (typeof style === 'function') return (state) => paintStyle(style(state));
  const flat = flatten(style);
  if (!neutral(flat.backgroundColor)) return style;
  if (style && typeof style === 'object') {
    const hit = styleCache.get(style);
    if (hit) return hit;
    const result = [style, material.surface];
    styleCache.set(style, result);
    return result;
  }
  return [style, material.surface];
}

function paintLabel(child) {
  if (!React.isValidElement(child)) return child;
  const props = child.props;
  const next = {};
  const style = flatten(props.style);
  if (neutral(style.color)) next.style = [props.style, { color: material.foreground }];
  if (typeof props.className === 'string') {
    const name = props.className.replace(DARK_TEXT, ' text-white');
    if (name !== props.className) {
      next.className = name;
      next.style = [props.style, { color: material.foreground }];
    }
  }
  if (neutral(props.color)) next.color = material.foreground;
  if (props.children !== undefined) next.children = React.Children.map(props.children, paintLabel);
  return Object.keys(next).length ? React.cloneElement(child, next) : child;
}

function controlProps(props) {
  if (!material || !props || (typeof props.onPress !== 'function' && props.accessibilityRole !== 'button')) return props;
  // Empty colour swatches and aspect-ratio preview tiles carry content colours.
  const flat = flatten(props.style);
  if (React.Children.count(props.children) === 0 || flat.aspectRatio !== undefined) return props;
  const fill = flat.backgroundColor;
  const ownMaterial = fill === material.surface.backgroundColor && flat.borderColor === material.surface.borderColor;
  const ownsSurface = material.ownedSurfaces?.some((surface) => fill !== undefined
    && fill === surface.backgroundColor && flat.borderColor === surface.borderColor);
  if (ownsSurface && !ownMaterial) return props;
  const classFill = fill === undefined && typeof props.className === 'string' && NEUTRAL_FILL.test(props.className);
  if (!classFill && !ownMaterial && typeof props.style !== 'function' && !neutral(fill)) return props;
  const style = classFill ? [props.style, material.surface] : paintStyle(props.style);
  return { ...props, style, children: React.Children.map(props.children, paintLabel) };
}

module.exports = { setControlMaterial, controlProps };
