---
inclusion: manual
---

# Privacy audit

Run on demand with `/privacy-audit` (kiro-workbench Requirement 2.3). Audit the whole repository against `.kiro/steering/security.md` and write the result to the chat. This is a review: do not edit, create or delete any file, and do not commit.

## Steps

1. Run `mise run check:all` and note any failing gate (secret scan, forbidden paths, audits, license policy, Pages CSP check).
2. Run `git ls-files -z | xargs -0 mise x -- python scripts/pii_scan.py` for personal data in tracked files.
3. Search the code in `apps/` and `packages/` for each of these, and read every hit in context:
   - Audio persisted anywhere: `MediaRecorder`, `IndexedDB`, `indexedDB`, `caches.`, `localStorage`, `sessionStorage`, `Blob` or `File` written to storage, `showSaveFilePicker`, and in Python `open(` in write mode, `.write(`, `tempfile`, `save(`, `NamedTemporaryFile`.
   - Network targets other than self: `fetch(`, `XMLHttpRequest`, `WebSocket(`, `navigator.sendBeacon`, `EventSource`, absolute `http://` or `https://` URLs, and in Python `requests`, `httpx`, `urllib`, `aiohttp`.
   - Audio, tokens or user file names in logs: `console.`, `logger.`, `logging.`, `print(` near audio buffers, session tokens or upload names.
   - Dependencies whose purpose is recording, uploading or transcribing audio, in every `package.json` and `pyproject.toml`.
4. Check the browser rules: every HTML file has the CSP from the security steering, no third-party scripts, fonts or CDNs, and ONNX Runtime WASM paths are self-hosted.
5. Check the engine rules (once `apps/engine` and `infra/docker` exist): Compose publishes only on `127.0.0.1`, the container hardening list, the WebSocket `Origin` and token checks, and the upload limits.
6. Check `.kiro/settings/mcp.json` and `.kiro/agents/` for literal credentials; only `${VAR}` references are allowed.

## Output

List findings ranked by severity (critical, high, medium, low). For each: file and line, the rule from `security.md` it breaks, and a one-line suggested fix. End with the commands you ran and their exit codes. If there are no findings, say "No findings" and still list the commands.
