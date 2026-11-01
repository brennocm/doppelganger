/**
 * Autopsy view (autopsy-mode Requirements 1–3): file intake, progress and cancel, the
 * timeline with thresholds and state segments, playback from any point, the verdict and
 * the JSON download. The file stays in memory and is dropped when the report closes.
 */
import type { AutopsyReport, HauntingState } from "@doppelganger/contracts";
import { intake, MESSAGES, supportedFormats } from "./intake.ts";
import { scorePoints, stepSeconds, timeAt, VERDICT_LABELS, xOf, yOf } from "./timeline.ts";

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`missing #${id}`);
  return found as T;
}

export interface AutopsyDeps {
  /** Sends 16 kHz samples to the worker; the buffer is transferred. */
  analyze(samples: Float32Array): void;
  cancel(): void;
  model(): { id: string; version: string };
  thresholds(): { unease: number; possession: number };
}

export interface AutopsyView {
  progress(done: number, total: number): void;
  report(report: AutopsyReport): void;
  cancelled(): void;
  setEnabled(enabled: boolean): void;
}

const SEGMENT_FILL: Partial<Record<HauntingState, string>> = {
  mask: "--color-purple-deep",
  unease: "--color-ember-deep",
  possession: "--color-blood-deep",
  exorcised: "--color-info-surface",
};

export function createAutopsyView(deps: AutopsyDeps): AutopsyView {
  const input = el<HTMLInputElement>("autopsy-file");
  const zone = el("drop-zone");
  const formats = el("autopsy-formats");
  const progressBox = el("autopsy-progress");
  const bar = el<HTMLProgressElement>("autopsy-bar");
  const percent = el("autopsy-percent");
  const status = el("autopsy-status");
  const reportBox = el("autopsy-report");
  const verdict = el("autopsy-verdict");
  const reason = el("autopsy-reason");
  const modelLabel = el("autopsy-model");
  const canvas = el<HTMLCanvasElement>("autopsy-timeline");
  const audio = el<HTMLAudioElement>("autopsy-audio");
  let current: AutopsyReport | null = null;
  let file: File | null = null;
  let url: string | null = null;
  let busy = false;

  const probe = document.createElement("audio");
  const list = supportedFormats((type) => probe.canPlayType(type));
  formats.textContent = `This browser can read: ${list.length > 0 ? list.join(", ") : "no listed formats"}.`;

  function release(): void {
    if (url !== null) URL.revokeObjectURL(url);
    url = null;
    file = null;
    audio.removeAttribute("src");
    audio.load();
  }

  function draw(): void {
    const ctx = canvas.getContext("2d");
    if (ctx === null || current === null) return;
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const h = Math.max(1, Math.round(canvas.clientHeight * ratio));
    canvas.width = w;
    canvas.height = h;
    const css = getComputedStyle(canvas);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const d = current.durationS;
    ctx.clearRect(0, 0, w, h);
    for (const seg of current.states) {
      const fill = SEGMENT_FILL[seg.state];
      if (fill === undefined) continue;
      ctx.fillStyle = color(fill);
      ctx.fillRect(xOf(seg.from, d, w), 0, Math.max(1, xOf(seg.to, d, w) - xOf(seg.from, d, w)), h);
      if (seg.state === "possession") {
        // Possession segments are marked in blood (design).
        ctx.fillStyle = color("--color-blood");
        ctx.fillRect(
          xOf(seg.from, d, w),
          0,
          Math.max(1, xOf(seg.to, d, w) - xOf(seg.from, d, w)),
          4 * ratio,
        );
      }
    }
    const t = deps.thresholds();
    ctx.lineWidth = ratio;
    ctx.setLineDash([6 * ratio, 4 * ratio]);
    for (const [value, name] of [
      [t.unease, "--color-ember"],
      [t.possession, "--color-blood"],
    ] as const) {
      ctx.strokeStyle = color(name);
      ctx.beginPath();
      ctx.moveTo(0, yOf(value, h));
      ctx.lineTo(w, yOf(value, h));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = color("--color-text-secondary");
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    for (const [i, p] of scorePoints(current.windows, d, w, h).entries()) {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.strokeStyle = color("--color-text");
    ctx.lineWidth = ratio;
    const x = xOf(audio.currentTime || 0, d, w);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    canvas.setAttribute("aria-valuemax", String(Math.round(d)));
    canvas.setAttribute("aria-valuenow", String(Math.round(audio.currentTime || 0)));
    canvas.setAttribute(
      "aria-valuetext",
      `${(audio.currentTime || 0).toFixed(1)} of ${d.toFixed(1)} seconds`,
    );
  }

  function seek(seconds: number): void {
    if (current === null) return;
    audio.currentTime = Math.min(current.durationS, Math.max(0, seconds));
    draw();
  }

  async function analyzeFile(next: File): Promise<void> {
    if (busy) return;
    release();
    reportBox.hidden = true;
    current = null;
    status.textContent = "Reading the file in this tab";
    busy = true;
    const result = await intake(next, async (bytes) =>
      new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes),
    );
    if (!result.ok) {
      busy = false;
      status.textContent = MESSAGES[result.error];
      return;
    }
    file = next;
    progressBox.hidden = false;
    bar.value = 0;
    percent.textContent = "0%";
    status.textContent = "Analyzing";
    deps.analyze(result.samples);
  }

  input.addEventListener("change", () => {
    const chosen = input.files?.[0];
    input.value = "";
    if (chosen !== undefined) void analyzeFile(chosen);
  });
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.dataset["over"] = "true";
  });
  zone.addEventListener("dragleave", () => delete zone.dataset["over"]);
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    delete zone.dataset["over"];
    const dropped = event.dataTransfer?.files[0];
    if (dropped !== undefined) void analyzeFile(dropped);
  });
  el<HTMLButtonElement>("autopsy-cancel").addEventListener("click", () => deps.cancel());
  el<HTMLButtonElement>("autopsy-close").addEventListener("click", () => {
    release();
    current = null;
    reportBox.hidden = true;
    status.textContent = "Report closed. The file was dropped.";
  });
  el<HTMLButtonElement>("autopsy-download").addEventListener("click", () => {
    if (current === null) return;
    const blob = new Blob([`${JSON.stringify(current, null, 2)}\n`], { type: "application/json" });
    const link = document.createElement("a");
    const href = URL.createObjectURL(blob);
    link.href = href;
    link.download = "doppelganger-autopsy.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  });
  canvas.addEventListener("click", (event) => {
    if (current === null) return;
    const box = canvas.getBoundingClientRect();
    seek(timeAt(event.clientX - box.left, box.width, current.durationS));
  });
  canvas.addEventListener("keydown", (event) => {
    if (current === null) return;
    const step = stepSeconds(current.windows);
    if (event.key === "ArrowRight") seek((audio.currentTime || 0) + step);
    else if (event.key === "ArrowLeft") seek((audio.currentTime || 0) - step);
    else if (event.key === "Enter")
      void (audio.paused ? audio.play() : Promise.resolve(audio.pause()));
    else return;
    event.preventDefault();
  });
  audio.addEventListener("timeupdate", draw);
  addEventListener("resize", draw);

  return {
    setEnabled(enabled) {
      input.disabled = !enabled;
    },
    progress(done, total) {
      const value = total > 0 ? Math.round((done / total) * 100) : 100;
      bar.value = value;
      percent.textContent = `${value}%`;
    },
    report(report) {
      busy = false;
      progressBox.hidden = true;
      current = report;
      verdict.textContent = VERDICT_LABELS[report.verdict];
      verdict.dataset["verdict"] = report.verdict;
      reason.textContent = report.verdictReason;
      const m = deps.model();
      modelLabel.textContent = `${report.modelId} ${report.modelVersion}`;
      if (m.id !== report.modelId) modelLabel.textContent += " (not the live model)";
      if (file !== null) {
        url = URL.createObjectURL(file);
        audio.src = url;
      }
      status.textContent = "Analysis complete.";
      reportBox.hidden = false;
      draw();
    },
    cancelled() {
      busy = false;
      progressBox.hidden = true;
      release();
      status.textContent = MESSAGES.cancelled;
    },
  };
}
