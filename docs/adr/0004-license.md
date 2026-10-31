# 0004 — MIT license

- Status: accepted
- Date: 2026-10-30
- Related: `project-foundation` (Requirements 4.4, 6.2), ml-honesty steering

## Context

Doppelgänger is a public hackathon project. It should be easy for anyone, including companies' SecOps teams, to read, run, audit, fork and reuse. Its dependencies and any model checkpoints come with their own licenses, which must stay compatible with how the project is distributed.

## Decision

- The project's own code and documentation are released under the **MIT License** (`LICENSE`, copyright "The Doppelgänger contributors").
- Dependencies must pass the license policy in Requirement 4.4, checked by `scripts/check_licenses.py`. Runtime dependencies use permissive licenses only (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, CC0-1.0, Python-2.0, PSF-2.0). Development-only tools may also be MPL-2.0 when used unmodified.
- Model checkpoints and datasets keep their own licenses. Each one is checked and recorded in the model card before use. A checkpoint whose license forbids redistribution is not committed (ml-honesty steering).

## Alternatives considered

- **Apache-2.0.** A strong option with an explicit patent grant. Not chosen: the project holds no patents, and MIT is shorter and more familiar to the target readers. The project can still depend on Apache-2.0 code.
- **GPL-3.0 or AGPL-3.0.** Rejected: copyleft would discourage companies from running or adapting the tool internally, which works against the impact goal.
- **No license, or "all rights reserved".** Rejected: others could not legally use or fork the code.

## Consequences

- Anyone can reuse the code with attribution.
- The MIT license does not cover model weights or datasets. Their licenses are tracked separately and may restrict what can be redistributed.
