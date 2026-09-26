// Drops console.log / console.debug / console.info calls from release bundles.
// warn and error stay: they are the crash breadcrumbs.
//
// metro.config.js asks terser to do this through pure_funcs, but Hermes
// builds skip Metro's minifier, so that never ran. Doing it at the babel step
// works whatever the engine.
//
// A call used as a statement is removed outright. Anywhere else it becomes
// `void 0`, which is what console.log returns anyway. Arguments are dropped
// with the call, same as babel-plugin-transform-remove-console.
const STRIPPED = new Set(["log", "debug", "info"]);

module.exports = function removeConsole({ types: t }) {
  function isStrippedCall(callee, scope) {
    if (!t.isMemberExpression(callee)) return false;
    if (!t.isIdentifier(callee.object, { name: "console" })) return false;
    if (scope.hasBinding("console")) return false;
    const prop = callee.property;
    const name = callee.computed
      ? t.isStringLiteral(prop) && prop.value
      : t.isIdentifier(prop) && prop.name;
    return !!name && STRIPPED.has(name);
  }

  return {
    name: "dehub-remove-console",
    visitor: {
      CallExpression(path) {
        if (!isStrippedCall(path.node.callee, path.scope)) return;
        if (path.parentPath.isExpressionStatement()) {
          path.parentPath.remove();
        } else {
          path.replaceWith(t.unaryExpression("void", t.numericLiteral(0)));
        }
      },
    },
  };
};
