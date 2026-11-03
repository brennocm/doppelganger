# Implementation Plan

- [x] 1. Engine skeleton
  - [x] 1.1 Scaffold `apps/engine` with config validation, JSON logging, `/healthz` and graceful shutdown
    - _Requirements: 1.1, 1.2, 1.4, 1.5_
  - [x] 1.2 Serve the web build at `/app/` with CSP, COOP/COEP and the other security headers
    - _Requirements: 1.3_
  - [x] 1.3 Verify the model hash at startup through `model_lab.inference`
    - _Requirements: 1.1_

- [x] 2. Guards
  - [x] 2.1 Implement `OriginGuard`, `TokenGuard` (token generation, launch URL log line) and failure rate limiting
    - _Requirements: 2.1, 2.3, 2.4, 2.5_
  - [x]* 2.2 Write property test for the origin guard
    - **Property 1: Origin guard**
    - **Validates: Requirements 2.3, 2.4**
  - [x]* 2.3 Write property test for the token guard
    - **Property 2: Token guard**
    - **Validates: Requirements 2.3**
  - [x] 2.4 Web app: read the token from the fragment, store it in `sessionStorage`, clean the URL
    - _Requirements: 2.2_

- [ ] 3. Streaming
  - [x] 3.1 Add the stream message schemas to `packages/contracts` and the PCM16 golden vectors
    - _Requirements: 3.1, 3.3_
  - [x]* 3.2 Write property test for the PCM16 round trip (TS and Python)
    - **Property 4: PCM16 round trip**
    - **Validates: Requirements 3.1, 3.2**
  - [x] 3.3 Implement `WS /v1/stream` with the per-connection ring buffer and scoring
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x]* 3.4 Write property test for stream parity with the detector
    - **Property 5: Stream parity with the detector**
    - **Validates: Requirements 3.2**
  - [x]* 3.5 Write property test for bounded per-connection memory
    - **Property 6: Bounded per-connection memory**
    - **Validates: Requirements 3.4**
  - [ ] 3.6 (Deferred, first in the cut order) Implement the engine score source in the web app: stream PCM16 to `WS /v1/stream` and feed its `score` messages into the Haunting_Machine, offered only when served by the engine
    - _Requirements: 3.5_

- [x] 4. Autopsy endpoint
  - [x] 4.1 Implement `SizeGuard` and `POST /v1/autopsy` with in-memory decoding
    - _Requirements: 4.1, 4.2, 4.3_
  - [x]* 4.2 Write property test for the size guard
    - **Property 3: Size guard**
    - **Validates: Requirements 4.1, 4.2**

- [x] 5. Container
  - [x] 5.1 Write the multi-stage Dockerfile with digest-pinned bases and a non-root user
    - _Requirements: 5.1, 5.4_
  - [x] 5.2 Write `infra/docker/compose.yaml` with the hardening settings and read-only model volume
    - _Requirements: 5.2, 5.3_
  - [x] 5.3 Add the CI container test (health, stream session, `docker inspect` assertions)
    - _Requirements: 5.1, 5.2_

- [ ] 6. Installer
  - [x] 6.1 Write `scripts/install.sh` with platform detection and prerequisite checks
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 6.2 Add download, checksum verification and engine startup with the health wait
    - _Requirements: 6.4, 6.7, 6.8_
  - [x] 6.3 Add `--static`, `--stop`, `--status` and `--uninstall`
    - _Requirements: 6.5, 6.6_
  - [x] 6.4 Write Bats tests with stubbed commands
    - _Requirements: 6.3, 6.7, 6.8_
  - [ ] 6.5 Add the release workflow that builds the web tarball and publishes the models and `SHA256SUMS`
    - Built and tested without publishing (2026-11-02): `scripts/release-bundle.sh`, `scripts/release-build.sh`, `release.yml` (dry run on manual start, draft release on a `v*` tag), 10 Bats tests that show `install.sh` accepting the bundle, and 5 static workflow tests. Left open: the `publish` job has never run, and it needs the real models in `release/models/` (PENDING-GATE) and a first tag from the developer.
    - _Requirements: 6.4_

- [ ] 7. Checkpoint
  - Run the installer on WSL2 on the reference laptop in both modes; run the `exorcist` agent over `apps/engine`, `infra/` and `scripts/`; record the results in the journal.
