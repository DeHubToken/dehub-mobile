// Preserve asset identity: badge geometry depends on which PNG was loaded.
module.exports = {
  process(_source, filename) {
    return { code: `module.exports = ${JSON.stringify(filename)};` };
  },
};
