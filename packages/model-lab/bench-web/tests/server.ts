import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = join(here, "../../../..");
/** URL prefix → folder. Nothing outside these folders is served. */
const ROOTS: Record<string, string> = {
  "/ort/": join(here, "../node_modules/onnxruntime-web/dist"),
  "/models/": join(repo, "apps/web/public/models"),
  "/": join(here, "../page"),
};
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".onnx": "application/octet-stream",
};

/** Static server for the benchmark page, bound to 127.0.0.1 only. */
export function startServer(): Promise<{ server: Server; origin: string }> {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const prefix = Object.keys(ROOTS).find((p) => path.startsWith(p)) ?? "/";
    const root = ROOTS[prefix] ?? "";
    const file = normalize(join(root, path.slice(prefix.length) || "index.html"));
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}
