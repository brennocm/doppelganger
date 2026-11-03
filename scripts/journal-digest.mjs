// Group the Kiro journal by feature and surface (submission task 2.1, design P48).
//
//   node scripts/journal-digest.mjs [docs/kiro-journal.md] > digest.md
//
// Raw material for docs/KIRO.md: every entry lands in exactly one feature group (the first
// feature it lists, or "unclassified"), and its line names the other features it used.
// It only reads the journal and writes Markdown to stdout.
import { readFile } from "node:fs/promises";
import { argv, exit, stderr, stdout } from "node:process";

/** The template's feature order (docs/kiro-journal.md). */
export const FEATURE_ORDER = ["spec", "hook", "steering", "MCP", "custom agent", "power", "PBT"];
export const UNCLASSIFIED = "unclassified";

const HEADING_RE = /^## (\d{4}-\d{2}-\d{2}) — (.+)$/;
const FENCE_RE = /^\s*(```|~~~)/;

function field(line, name) {
  const prefix = `- ${name}:`;
  return line.startsWith(prefix) ? line.slice(prefix.length).trim() : undefined;
}

function list(value) {
  return (value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/**
 * Entries in file order: `## YYYY-MM-DD — title` headings outside code fences, each with
 * the surface and feature lists from its own "Kiro surface" and "Feature used" lines.
 */
export function parseEntries(text) {
  const entries = [];
  let fenced = false;
  let current;
  for (const line of text.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = HEADING_RE.exec(line);
    if (heading) {
      current = { date: heading[1], title: heading[2].trim(), surfaces: [], features: [] };
      entries.push(current);
      continue;
    }
    if (current === undefined) continue;
    const surface = field(line, "Kiro surface");
    if (surface !== undefined && current.surfaces.length === 0) current.surfaces = list(surface);
    const features = field(line, "Feature used");
    if (features !== undefined && current.features.length === 0) current.features = list(features);
  }
  return entries;
}

/** Feature groups in template order, then others by first appearance, then unclassified. */
export function groupEntries(entries) {
  const groups = new Map(FEATURE_ORDER.map((feature) => [feature, []]));
  const unclassified = [];
  for (const entry of entries) {
    const [primary] = entry.features;
    if (primary === undefined) {
      unclassified.push(entry);
      continue;
    }
    if (!groups.has(primary)) groups.set(primary, []);
    groups.get(primary).push(entry);
  }
  const out = [...groups].filter(([, members]) => members.length > 0);
  if (unclassified.length > 0) out.push([UNCLASSIFIED, unclassified]);
  return out;
}

function surfaceCounts(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const surfaces = entry.surfaces.length > 0 ? entry.surfaces : ["(none)"];
    for (const surface of surfaces) counts.set(surface, (counts.get(surface) ?? 0) + 1);
  }
  return counts;
}

function entryLine(entry) {
  const also = entry.features.slice(1);
  const suffix = also.length > 0 ? ` (also: ${also.join(", ")})` : "";
  return `- ${entry.date} — ${entry.title}${suffix}`;
}

/** The Markdown digest of a journal's text. */
export function digest(text) {
  const entries = parseEntries(text);
  const lines = [
    "# Journal digest",
    "",
    `${entries.length} entries. Each entry is listed once, under the first feature it names.`,
    "",
    "| Kiro surface | Entries |",
    "| --- | --- |",
  ];
  for (const [surface, count] of surfaceCounts(entries)) lines.push(`| ${surface} | ${count} |`);
  for (const [feature, members] of groupEntries(entries)) {
    lines.push("", `## ${feature} (${members.length})`, "");
    for (const entry of members) lines.push(entryLine(entry));
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const path = argv[2] ?? "docs/kiro-journal.md";
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    stderr.write(`journal-digest: cannot read ${path}\n`);
    return 1;
  }
  stdout.write(digest(text));
  return 0;
}

if (import.meta.url === `file://${argv[1]}`) {
  exit(await main());
}
