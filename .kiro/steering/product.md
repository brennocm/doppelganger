---
inclusion: always
---

# Product: Doppelgänger

Doppelgänger is a real-time voice-clone detector that runs on the user's own device. It listens to the remote side of a call (a browser tab such as Google Meet, Teams web or WhatsApp Web), scores each slice of speech for signs of synthetic or cloned voice, and turns that score into an interface that is calm while the voice sounds human and visibly "rots" when it does not.

## The problem

Voice cloning makes social-engineering calls cheap: a fake CEO asking for an urgent wire or PIX transfer, a fake relative asking for money. Passwords and network security do not help at the moment a person decides whether to trust a voice. People also suffer alert fatigue, so a detector that cries wolf is worse than none.

## Who it is for

- Employees who approve payments or share sensitive data over calls.
- SecOps teams who want a local, auditable tool with no cloud dependency.
- Anyone curious, who must be able to try it with one click.

## Delivery tiers

1. **Demo (primary):** a static PWA on GitHub Pages. Inference runs in the browser (ONNX Runtime Web). Audio never leaves the device and nothing needs to be installed.
2. **Self-hosted:** the same static build, served from the user's own machine, for people who do not trust a third-party host. Works offline.
3. **Pro engine (optional plus):** a Docker container with a heavier model and the Autopsy mode, bound to localhost only.

## Core experience

- **Haunting states:** Idle → Listening → Mask (human) → Unease → Possession (likely clone) → Exorcised (protocol completed).
- **Exorcism protocol:** when possession is detected, the UI tells the user what to do: do not approve anything now, ask the agreed code word, hang up and call back on a known number, report it.
- **Floating widget:** a Document Picture-in-Picture window that stays on top of the call.
- **Autopsy mode:** drop a recorded audio file (for example a WhatsApp voice note) and get a dissonance timeline.
- **Replay mode:** labelled, pre-recorded real and cloned samples (the author's own consented voice) for a deterministic demo, when such clips are bundled.

## Product principles

- **Honest over impressive.** Never fake a detection, never invent accuracy numbers. Limitations are documented.
- **Calm by default.** Alerts need sustained evidence (smoothing plus hysteresis). Fewer, truer alarms.
- **Local by construction.** No audio, transcript or score leaves the device. There is no secret to leak.
- **Action over alarm.** Every alert comes with the next step.

## Non-goals

- Speaker identification ("is this really my boss?"). We only estimate whether a voice is synthetic.
- Generating voice clones. The repository never ships cloning tools.
- Native desktop apps, mobile apps, or call-platform plugins.
- Storing, transcribing or uploading audio.
