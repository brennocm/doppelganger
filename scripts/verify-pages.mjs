// Verify the GitHub Pages artifact (Requirements 5.3 and 5.4).
//
//   node scripts/verify-pages.mjs [dist/pages]
//
// Fails when any HTML file:
//   - lacks the Content-Security-Policy meta tag from .kiro/steering/security.md, or
//   - references a URL on another origin (src, href, srcset, poster, action, formaction).
// The landing page's YouTube facade is the only exception: www.youtube-nocookie.com,
// allowed only in the root index.html, and only together with the matching frame-src.
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { argv, exit, stderr, stdout } from "node:process";

export const BASE_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; " +
  "connect-src 'self'; img-src 'self' data:; style-src 'self'; media-src 'self' blob:; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'";
const YOUTUBE = "https://www.youtube-nocookie.com";
export const LANDING_CSP = `${BASE_CSP}; frame-src ${YOUTUBE}`;

const URL_ATTRIBUTES = ["src", "href", "srcset", "poster", "action", "formaction"];
const ATTRIBUTE_RE = new RegExp(
  `\\s(${URL_ATTRIBUTES.join("|")})\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
  "gi",
);
const META_RE = /<meta\b[^>]*>/gi;

/** Decode the few HTML entities that can appear in attribute values. */
function decode(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function attribute(tag, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? decode(match[1] ?? match[2] ?? "") : undefined;
}

/** Return the CSP values of every http-equiv Content-Security-Policy meta tag. */
export function cspValues(html) {
  return (html.match(META_RE) ?? [])
    .filter((tag) => attribute(tag, "http-equiv")?.toLowerCase() === "content-security-policy")
    .map((tag) => attribute(tag, "content") ?? "");
}

/** Return every URL referenced by a URL-bearing attribute. */
export function referencedUrls(html) {
  const urls = [];
  for (const match of html.matchAll(ATTRIBUTE_RE)) {
    const name = match[1].toLowerCase();
    const value = decode(match[2] ?? match[3] ?? match[4] ?? "").trim();
    if (name === "srcset") {
      for (const candidate of value.split(",")) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) urls.push(url);
      }
    } else {
      urls.push(value);
    }
  }
  return urls;
}

/** True when the URL leaves the page's own origin (absolute or protocol-relative). */
export function isExternal(url) {
  if (url.startsWith("//")) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (!scheme) return false;
  return !["data", "blob", "mailto"].includes(scheme[1].toLowerCase());
}

/** Check one HTML document; return a list of problems. */
export function checkHtml(path, html) {
  const problems = [];
  const isLanding = path === "index.html";
  const csp = cspValues(html);
  const allowedCsp = isLanding ? [BASE_CSP, LANDING_CSP] : [BASE_CSP];
  if (csp.length !== 1) {
    problems.push(`${path}: expected exactly one CSP meta tag, found ${csp.length}`);
  } else if (!allowedCsp.includes(csp[0])) {
    problems.push(`${path}: CSP differs from the security steering: "${csp[0]}"`);
  }
  const embedsYoutube = isLanding && csp[0] === LANDING_CSP;
  for (const url of referencedUrls(html)) {
    if (!isExternal(url)) continue;
    if (embedsYoutube && url.startsWith(`${YOUTUBE}/`)) continue;
    problems.push(`${path}: references an external origin: ${url}`);
  }
  return problems;
}

/**
 * Hosts that may appear in emitted scripts, only as text inside error messages (they are
 * never fetched). Anything else that looks like an absolute URL in a .js or .mjs file fails
 * the check, because a dedicated worker on Pages runs without the page's CSP.
 */
export const SCRIPT_TEXT_HOSTS = ["web.dev", "rolldown.rs"];
const SCRIPT_URL_RE = /\bhttps?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;

/** Check one emitted script; return a list of problems. */
export function checkScript(path, source) {
  const problems = [];
  for (const match of source.matchAll(SCRIPT_URL_RE)) {
    const host = match[1].toLowerCase();
    if (!SCRIPT_TEXT_HOSTS.includes(host)) {
      problems.push(`${path}: script contains an absolute URL to ${host}`);
    }
  }
  return problems;
}

async function htmlFiles(dir) {
  return filesEndingWith(dir, [".html"]);
}

async function filesEndingWith(dir, suffixes) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && suffixes.some((s) => entry.name.endsWith(s)))
    .map((entry) => join(entry.parentPath, entry.name));
}

async function main() {
  const root = argv[2] ?? "dist/pages";
  const files = await htmlFiles(root);
  if (files.length === 0) {
    stderr.write(`verify-pages: no HTML files under ${root}\n`);
    return 1;
  }
  const problems = [];
  for (const file of files.sort()) {
    const path = relative(root, file).split(sep).join("/");
    problems.push(...checkHtml(path, await readFile(file, "utf8")));
  }
  const scripts = await filesEndingWith(root, [".js", ".mjs"]);
  for (const file of scripts.sort()) {
    const path = relative(root, file).split(sep).join("/");
    problems.push(...checkScript(path, await readFile(file, "utf8")));
  }
  for (const problem of problems) stderr.write(`verify-pages: ${problem}\n`);
  stdout.write(
    `verify-pages: ${problems.length === 0 ? "ok" : "FAILED"}, ${files.length} HTML file(s), ${scripts.length} script(s), ${problems.length} problem(s)\n`,
  );
  return problems.length === 0 ? 0 : 1;
}

if (import.meta.url === `file://${argv[1]}`) {
  exit(await main());
}
