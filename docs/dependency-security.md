# Dependency security backports

The lockfiles pin published security releases where compatible releases exist. The remaining packages have no fix in the major version their consumers support. Installation applies source backports through `scripts/patch-security-dependencies.cjs`; unexpected package versions or source layouts fail installation. CI runs behavior regressions against every installed copy, including pnpm's nested packages.

| Package | Protection |
| --- | --- |
| decode-uri-component 0.2.2 | Uses the upstream 0.5.1 linear decoder, exported as CommonJS for query-string. |
| deepmerge 4.3.1 | Defines own data properties rather than invoking inherited setters when copying target/source keys. |
| elliptic 6.6.1 | Preserves the full generated nonce width when truncating RFC6979 output; P-521 edge-case vectors check the signature bytes. |
| stream-json 1.9.1 | Defines own parsed properties and caps nesting at 128 levels before quadratic path processing. This major has no JSONC parser. |
| zod 3.25.76 | Rejects oversized bounded arrays/sets before parsing their elements. Its embedded v4 export receives the same upper-bound gate. Standalone v4 is pinned to 4.6.7. |
| bigint-buffer 1.1.5, where installed | Uses the package's JavaScript fallback exclusively; the vulnerable native addon is never loaded. |
| Nest core 10, where installed | Strips line separators from SSE event/type identifiers before serialization. |

These backports do not change package version labels. Version-only npm/Dependabot reports will continue to list the upstream advisories. They must be assessed alongside the installed-source regressions; no advisory is dismissed or described as fixed solely because a package installed successfully. Do not deploy with lifecycle scripts disabled.

References: [Zod bound ordering](https://github.com/colinhacks/zod/commit/a0ebf97), [elliptic nonce width](https://github.com/indutny/elliptic/issues/321), [deepmerge poisoning](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), [stream-json prototype assignment](https://github.com/advisories/GHSA-mjw6-4jj6-33hc), [bigint-buffer native overflow](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg), [Nest SSE fields](https://github.com/advisories/GHSA-36xv-jgw5-4q75).
