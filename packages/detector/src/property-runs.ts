/**
 * fast-check settings for every property test in this package (testing steering): at least
 * 200 runs and a fixed seed, so runs are deterministic. To explore other inputs, change the
 * seed locally; add any shrunk counterexample as an example test.
 */
export const RUNS = { numRuns: 200, seed: 20261101 } as const;
