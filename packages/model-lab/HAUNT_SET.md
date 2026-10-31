# Haunt_Set: how to record it

detection-model task 2.1 (Requirements 7.1 and 7.2). The Haunt_Set is the private evaluation set: your own genuine voice, plus clones of your own voice made with your consent. It decides the go/no-go gate on **9 November**. All audio and all sentence text stay **outside this repository**, under `$HAUNT_SET_DIR`.

## What to record

| Part | Amount | Notes |
| --- | --- | --- |
| Genuine sessions | 6 sessions, 2 per day on 3 different days | Each session uses a different device and room. 4 in Brazilian Portuguese, 2 in English. |
| Each genuine session | 20 read sentences (4–8 s each) + about 2 minutes of free speech | 10 scam-like and 10 neutral sentences, mixed. About 4–5 minutes per session, about 30 minutes in total. |
| Reference session | 1 session, 3–5 minutes, clean | Input for the cloning systems **only**. Never evaluated. |
| Clones | 2 systems: one TTS cloner and one voice-conversion system | Each reproduces the sentences of every genuine session, plus a transcript of the free speech. At least 15–20 minutes per system for the gate; more can be added later. |

### Session plan

| Session | Day | Language | Device and room |
| --- | --- | --- | --- |
| s01 | 1 | pt-BR | your choice, write it in `index.csv` |
| s02 | 1 | en | a different device and room from s01 |
| s03 | 2 | pt-BR | |
| s04 | 2 | pt-BR | a different device and room from s03 |
| s05 | 3 | pt-BR | |
| s06 | 3 | en | a different device and room from s05 |

Use at least 3 devices overall, for example a laptop microphone, a phone and a headset, and at least 2 rooms.

## Getting the sentences

The generator prints the 20 sentences and 2 free-speech topics of every session. It refuses to write into any git repository, so the text never ends up in this one.

```bash
export HAUNT_SET_DIR=/path/outside/the/repo      # your own path
mise x -- uv run --locked python -m model_lab.haunt_scripts --out "$HAUNT_SET_DIR/scripts"
```

It writes `scripts/<session>/<script_id>.txt` and `scripts/plan.json`. The plan holds the random seed, so you can print the same sentences again with `--seed`. Keep that folder; the clones must read exactly the same text.

## Recording checklist (each genuine session)

Before you start:

- [ ] Turn off noise suppression, echo cancellation and automatic gain in the operating system, the browser and the recording app.
- [ ] Format: mono, WAV or FLAC, 16 kHz or higher (48 kHz is fine), 16 or 24 bits.
- [ ] Quiet room, normal speaking distance, normal volume. Do one test sentence and check that it doesn't clip.
- [ ] Write down the device and room for `index.csv`.

While recording:

- [ ] Read each sentence `t01` to `t20` once, at your normal speed, as if on a call. Save one file per sentence: `genuine/<session>/<script_id>.flac`, for example `genuine/s01/t07.flac`.
- [ ] Leave about half a second of silence before and after each sentence.
- [ ] If you stumble, record the sentence again and keep only the good take.
- [ ] Speak freely about each topic for about a minute: `free-1.flac` and `free-2.flac`.
- [ ] Write a plain-text transcript of what you said in the free speech, `free-1.txt` and `free-2.txt` next to the audio. The clones need it.

After recording:

- [ ] Listen to two or three files at random.
- [ ] Add one row per file to `index.csv` (see below).

## Making the clones

- [ ] Clone **only your own voice**, from the reference session. Do not use audio from s01–s06 as clone input.
- [ ] Use two different systems: one TTS cloner (text to speech in your voice) and one voice-conversion system (converts a recording into your voice). For voice conversion, use a source recording that is not one of your s01–s06 takes.
- [ ] For every genuine session, make one clone file per sentence and per free-speech transcript, with the same `<script_id>`: `synthetic/<system_id>/<session>/<script_id>.flac`. A clone of `genuine/s03/t12.flac` made with system `tts-a` goes to `synthetic/tts-a/s03/t12.flac`.
- [ ] Export at the system's native quality; don't add effects.
- [ ] Keep any cloning prompts, settings and account details outside this repository and out of `index.csv` (Requirement 7.2). The `system_id` is just a short label such as `tts-a` or `vc-b`.

## Folder layout

```text
$HAUNT_SET_DIR/
├── consent.md                                      # dated statement, see below
├── scripts/<session>/<script_id>.txt               # from the generator; never committed
├── scripts/plan.json
├── reference/ref-01/*.flac                         # clone input only, never evaluated
├── genuine/<session>/<script_id>.flac              # plus free-1.txt and free-2.txt transcripts
├── synthetic/<system_id>/<session>/<script_id>.flac
└── index.csv
```

Clones sit under the genuine session they mirror. The dev/eval split works by session (task 2.4), so each sentence and its clones always land on the same side.

### `index.csv`

One row per audio file. Use paths relative to `$HAUNT_SET_DIR`, never absolute paths: reports must not contain raw paths (Requirement 2.4).

```csv
path,label,session_id,system_id,device,room,language,script_id
genuine/s01/t01.flac,genuine,s01,,laptop-mic,office,pt-BR,t01
synthetic/tts-a/s01/t01.flac,synthetic,s01,tts-a,,,pt-BR,t01
```

- `label`: `genuine` or `synthetic`.
- `system_id`: empty for genuine files.
- `device` and `room`: short labels you choose, for genuine files only.

The reference session is not listed in `index.csv`.

### `consent.md`

A short dated statement in your own words: the voice in every file is yours, you agree to its use for evaluating this detector, and every synthetic file is a clone of your own voice, made by you. This file stays in `$HAUNT_SET_DIR` with the audio.

## What never goes into the repository

Raw Haunt_Set audio, the sentence text, the free-speech transcripts, `index.csv`, cloning prompts and settings. The only audio ever committed is the short, labelled replay clips chosen later (task 7.2, each under 30 seconds) in `apps/web/public/replay/`.
