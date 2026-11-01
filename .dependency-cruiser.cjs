/**
 * Boundary rules from .kiro/steering/structure.md, enforced in `mise run check`.
 * Violations print the importing file, the imported module and the rule name.
 * @type {import('dependency-cruiser').IConfiguration}
 */
const TEST_FILE = "\\.(test|spec|prop)\\.ts$";
/** Browser page served by packages/model-lab/bench-web/tests/server.ts, not bundled. */
const BENCH_PAGE = "^packages/model-lab/bench-web/page/";

module.exports = {
  forbidden: [
    {
      name: "no-cross-app-imports",
      comment: "apps/* depend on packages/*; apps never import each other.",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "packages-do-not-import-apps",
      comment: "Dependencies point from apps to packages, never the other way.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "detector-depends-only-on-contracts",
      comment:
        "packages/detector may import only packages/contracts: no DOM, no Web Audio, no onnxruntime, no other npm or Node modules. Test files may use test tooling.",
      severity: "error",
      from: { path: "^packages/detector/", pathNot: TEST_FILE },
      to: { pathNot: "^packages/(detector|contracts)/" },
    },
    {
      name: "tokens-have-no-runtime-dependencies",
      comment: "packages/tokens has no runtime dependencies.",
      severity: "error",
      from: { path: "^packages/tokens/src/", pathNot: TEST_FILE },
      to: { pathNot: "^packages/tokens/" },
    },
    {
      name: "no-circular",
      comment: "No circular dependencies.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      comment: "Every import must resolve.",
      severity: "error",
      from: { pathNot: BENCH_PAGE },
      to: { couldNotResolve: true },
    },
    {
      name: "not-to-unresolvable-bench-page",
      comment:
        "The bench-web page imports ONNX Runtime Web by URL (/ort/…), which its test server maps to node_modules/onnxruntime-web/dist. Only that URL prefix is exempt; every other import must resolve.",
      severity: "error",
      from: { path: BENCH_PAGE },
      to: { couldNotResolve: true, pathNot: "^/ort/[^/]+\\.mjs$" },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(node_modules|dist|coverage|\\.venv)/" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
      extensions: [".ts", ".js", ".mjs", ".json"],
    },
  },
};
