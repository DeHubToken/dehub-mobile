const { buildDedupeMap, patchedPackagePaths, resolveIn } = require("../../metro/dedupe-identical-packages");

const allow = [/^@noble\//, /^@solana\/(?!web3\.js$)/];

describe("buildDedupeMap", () => {
  it("merges same-version copies whose dependencies resolve the same way", () => {
    const packages = {
      "node_modules/@solana/errors": { version: "2.3.0" },
      "node_modules/@solana/keys": { version: "6.10.0", dependencies: { "@solana/errors": "6.10.0" } },
      "node_modules/@solana/keys/node_modules/@solana/errors": { version: "6.10.0" },
      "node_modules/@solana/codecs-core": { version: "6.10.0", dependencies: { "@solana/errors": "6.10.0" } },
      "node_modules/@solana/codecs-core/node_modules/@solana/errors": { version: "6.10.0" },
    };
    const map = buildDedupeMap(packages, { allow });
    expect(map.get("node_modules/@solana/keys/node_modules/@solana/errors")).toBe(
      "node_modules/@solana/codecs-core/node_modules/@solana/errors",
    );
    expect(map.has("node_modules/@solana/errors")).toBe(false);
  });

  it("keeps copies apart when the same version would load a different dependency", () => {
    const packages = {
      "node_modules/@noble/hashes": { version: "2.2.0" },
      "node_modules/a": { version: "1.0.0" },
      "node_modules/a/node_modules/@noble/curves": { version: "1.9.7", dependencies: { "@noble/hashes": "*" } },
      "node_modules/b": { version: "1.0.0" },
      "node_modules/b/node_modules/@noble/curves": { version: "1.9.7", dependencies: { "@noble/hashes": "*" } },
      "node_modules/b/node_modules/@noble/hashes": { version: "1.8.0" },
    };
    const map = buildDedupeMap(packages, { allow });
    expect(map.has("node_modules/b/node_modules/@noble/curves")).toBe(false);
    expect(map.has("node_modules/a/node_modules/@noble/curves")).toBe(false);
  });

  it("leaves patched folders and non-allowlisted packages alone", () => {
    const packages = {
      "node_modules/x/node_modules/@noble/hashes": { version: "1.7.0" },
      "node_modules/y/node_modules/@noble/hashes": { version: "1.7.0" },
      "node_modules/x/node_modules/@walletconnect/core": { version: "2.21.0" },
      "node_modules/y/node_modules/@walletconnect/core": { version: "2.21.0" },
      "node_modules/x/node_modules/@solana/web3.js": { version: "1.98.4" },
      "node_modules/y/node_modules/@solana/web3.js": { version: "1.98.4" },
    };
    const map = buildDedupeMap(packages, { allow, patched: new Set(["node_modules/y/node_modules/@noble/hashes"]) });
    expect(map.size).toBe(0);
  });

  it("survives dependency cycles", () => {
    const packages = {
      "node_modules/p/node_modules/@noble/a": { version: "1.0.0", dependencies: { "@noble/b": "1" } },
      "node_modules/p/node_modules/@noble/b": { version: "1.0.0", dependencies: { "@noble/a": "1" } },
      "node_modules/q/node_modules/@noble/a": { version: "1.0.0", dependencies: { "@noble/b": "1" } },
      "node_modules/q/node_modules/@noble/b": { version: "1.0.0", dependencies: { "@noble/a": "1" } },
    };
    const map = buildDedupeMap(packages, { allow });
    expect(map.get("node_modules/q/node_modules/@noble/a")).toBe("node_modules/p/node_modules/@noble/a");
  });

  it("never merges copies that load different folders of a patched package", () => {
    const packages = {
      "node_modules/@noble/hashes": { version: "1.7.0" },
      "node_modules/a/node_modules/@noble/curves": { version: "1.8.1", dependencies: { "@noble/hashes": "1.7.0" } },
      "node_modules/b/node_modules/@noble/curves": { version: "1.8.1", dependencies: { "@noble/hashes": "1.7.0" } },
      "node_modules/b/node_modules/@noble/hashes": { version: "1.7.0" },
    };
    const map = buildDedupeMap(packages, { allow, patched: new Set(["node_modules/@noble/hashes"]) });
    expect(map.has("node_modules/a/node_modules/@noble/curves")).toBe(false);
    expect(map.has("node_modules/b/node_modules/@noble/curves")).toBe(false);
    expect(map.has("node_modules/b/node_modules/@noble/hashes")).toBe(false);
  });

  it("still merges copies that load the same folder of a patched package", () => {
    const packages = {
      "node_modules/@noble/hashes": { version: "1.7.0" },
      "node_modules/a/node_modules/@noble/curves": { version: "1.8.1", dependencies: { "@noble/hashes": "1.7.0" } },
      "node_modules/b/node_modules/@noble/curves": { version: "1.8.1", dependencies: { "@noble/hashes": "1.7.0" } },
    };
    const map = buildDedupeMap(packages, { allow, patched: new Set(["node_modules/@noble/hashes"]) });
    expect(map.get("node_modules/b/node_modules/@noble/curves")).toBe("node_modules/a/node_modules/@noble/curves");
  });
});

describe("resolveIn", () => {
  it("walks up the node_modules tree like Node does", () => {
    const packages = {
      "node_modules/@s/dep": { version: "1.0.0" },
      "node_modules/a/node_modules/@s/dep": { version: "2.0.0" },
      "node_modules/a/node_modules/b": { version: "1.0.0" },
    };
    expect(resolveIn(packages, "node_modules/a/node_modules/b", "@s/dep")).toBe("node_modules/a/node_modules/@s/dep");
    expect(resolveIn(packages, "node_modules/c", "@s/dep")).toBe("node_modules/@s/dep");
    expect(resolveIn(packages, "node_modules/c", "missing")).toBeNull();
  });
});

describe("patchedPackagePaths", () => {
  it("turns plain and nested patch file names into the folders they patch", () => {
    const paths = patchedPackagePaths(require("path").join(__dirname, "../../patches"));
    expect(paths.has("node_modules/@noble/hashes")).toBe(true);
    expect(paths.has("node_modules/@toruslabs/ethereum-controllers/node_modules/@toruslabs/base-controllers")).toBe(true);
  });
});
