// Keep the download provider's lazy modules in the existing test module registry.
module.exports = function ({ types }) {
  return {
    visitor: {
      CallExpression(path, state) {
        if (!/[\\/]context[\\/]VideoDownloadContext\.tsx$/.test(state.filename || "")) return;
        if (!types.isImport(path.node.callee) || path.node.arguments.length !== 1) return;
        const load = types.arrowFunctionExpression([], types.callExpression(types.identifier("require"), path.node.arguments));
        const resolved = types.callExpression(types.memberExpression(types.identifier("Promise"), types.identifier("resolve")), []);
        path.replaceWith(types.callExpression(types.memberExpression(resolved, types.identifier("then")), [load]));
      },
    },
  };
};
