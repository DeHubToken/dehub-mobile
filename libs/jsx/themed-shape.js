const React = require("react");
const { squareProps } = require("./shape");

const ThemeShapeContext = React.createContext(false);
const wrappers = new Map();

/** Keep mounted elements reactive to shape changes without resetting navigation. */
function themedType(type, renderElement) {
  let wrapped = wrappers.get(type);
  if (!wrapped) {
    wrapped = React.forwardRef(function ThemeShape(props, ref) {
      const minimal = React.useContext(ThemeShapeContext);
      const next = squareProps(props, minimal);
      return renderElement(type, ref == null ? next : { ...next, ref });
    });
    wrappers.set(type, wrapped);
  }
  return wrapped;
}

module.exports = { ThemeShapeContext, themedType };
