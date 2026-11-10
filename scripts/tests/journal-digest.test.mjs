// scripts/journal-digest.mjs (release tasks 2.1 and 2.2, design P48).
// Run with `node --test scripts/tests/`.
import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import {
  digest,
  FEATURE_ORDER,
  groupEntries,
  parseEntries,
  UNCLASSIFIED,
} from "../journal-digest.mjs";

const date = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
// Titles and free text never start a heading or a field line, as in a well-formed journal.
const words = fc
  .stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ,.:()'-]{0,40}$/)
  .map((s) => s.trim() || "x");
const feature = fc.oneof(fc.constantFrom(...FEATURE_ORDER), fc.constantFrom("Crew", "vibe"));
const entry = fc.record({
  date,
  title: words,
  surfaces: fc.uniqueArray(fc.constantFrom("IDE", "CLI", "Web", "Crew"), { maxLength: 2 }),
  features: fc.uniqueArray(feature, { maxLength: 4 }),
  body: fc.array(words, { maxLength: 3 }),
  fencedHeading: fc.boolean(),
});

function render(entries) {
  const parts = ["# Kiro journal", "", "```markdown", "## YYYY-MM-DD — <short title>", "```", ""];
  for (const e of entries) {
    parts.push(`## ${e.date} — ${e.title}`);
    if (e.surfaces.length > 0) parts.push(`- Kiro surface: ${e.surfaces.join(" | ")}`);
    if (e.features.length > 0) parts.push(`- Feature used: ${e.features.join(" | ")}`);
    for (const line of e.body) parts.push(`- What happened: ${line}`);
    // A heading-shaped line inside a code fence is not an entry.
    if (e.fencedHeading) parts.push("```", `## ${e.date} — quoted, not an entry`, "```");
    parts.push("");
  }
  return parts.join("\n");
}

test("Property 1: every entry appears in exactly one feature group", () => {
  fc.assert(
    fc.property(fc.array(entry, { maxLength: 25 }), (entries) => {
      const parsed = parseEntries(render(entries));
      assert.equal(parsed.length, entries.length);
      const groups = groupEntries(parsed);
      const placed = groups.flatMap(([, members]) => members);
      assert.equal(placed.length, entries.length);
      assert.equal(new Set(placed).size, entries.length);
      for (const [name, members] of groups) {
        for (const member of members) assert.equal(name, member.features[0] ?? UNCLASSIFIED);
      }
      const text = digest(render(entries));
      const listed = text.split("\n").filter((line) => /^- \d{4}-\d{2}-\d{2} — /.test(line));
      assert.equal(listed.length, entries.length);
    }),
    { numRuns: 300 },
  );
});

test("groups follow the template order, then others, then unclassified", () => {
  const text = render([
    {
      date: "2026-11-01",
      title: "a",
      surfaces: ["CLI"],
      features: ["vibe"],
      body: [],
      fencedHeading: false,
    },
    {
      date: "2026-11-02",
      title: "b",
      surfaces: ["CLI"],
      features: [],
      body: [],
      fencedHeading: false,
    },
    {
      date: "2026-11-03",
      title: "c",
      surfaces: ["IDE"],
      features: ["PBT", "spec"],
      body: [],
      fencedHeading: false,
    },
    {
      date: "2026-11-04",
      title: "d",
      surfaces: [],
      features: ["spec"],
      body: [],
      fencedHeading: true,
    },
  ]);
  const out = digest(text);
  const headings = out.split("\n").filter((line) => line.startsWith("## "));
  assert.deepEqual(headings, [
    "## spec (1)",
    "## PBT (1)",
    "## vibe (1)",
    `## ${UNCLASSIFIED} (1)`,
  ]);
  assert.match(out, /^- 2026-11-03 — c \(also: spec\)$/m);
  assert.match(out, /^\| CLI \| 2 \|$/m);
  assert.match(out, /^\| \(none\) \| 1 \|$/m);
});

test("the real journal parses with every entry placed", async () => {
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(new URL("../../docs/kiro-journal.md", import.meta.url), "utf8");
  const headings = text.split("\n").filter((line) => /^## \d{4}-\d{2}-\d{2} — /.test(line)).length;
  const parsed = parseEntries(text);
  assert.equal(parsed.length, headings);
  assert.equal(groupEntries(parsed).flatMap(([, m]) => m).length, headings);
});
