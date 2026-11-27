import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { probeStaticDeployment } from "../../src/deployment-health/static-probe.js";
import { runPagesHealthChecks } from "../../src/deployment-health/run.js";

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        port,
        baseUrl: `http://127.0.0.1:${port}/`,
        close: () => new Promise((done, reject) => server.close((error) => (error ? reject(error) : done())))
      });
    });
  });
}

test("healthy fixture: assets present with javascript MIME", async () => {
  const server = await startServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><body><div id="root"></div>
        <script type="module" src="./assets/main-healthy.js"></script></body></html>`);
      return;
    }
    if (req.url === "/assets/main-healthy.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end("console.log('ok')");
      return;
    }
    res.writeHead(404).end();
  });

  try {
    const outcome = await probeStaticDeployment({
      name: "healthy",
      baseUrl: server.baseUrl,
      kind: "learner-hub"
    });
    const byId = Object.fromEntries(outcome.results.map((item) => [item.id, item]));
    assert.equal(byId["pages.html"].passed, true);
    assert.equal(byId["pages.assets.present"].passed, true);
    assert.equal(byId["pages.mime"].passed, true);
    assert.equal(byId["pages.no-typescript-source"].passed, true);
  } finally {
    await server.close();
  }
});

test("broken fixture: TypeScript source + HTML MIME for JS is detected", async () => {
  const server = await startServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><body><div id="root"></div>
        <script type="module" src="./src/main.tsx"></script></body></html>`);
      return;
    }
    // Classic Pages failure: missing asset falls through to index.html
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><body>fallback</body></html>`);
  });

  try {
    const report = await runPagesHealthChecks({
      name: "broken-local",
      baseUrl: server.baseUrl,
      kind: "learner-hub",
      curriculum: { enabled: false },
      boot: { enabled: false },
      retries: { attempts: 1, delayMs: 0 }
    }, { skipBrowser: true });

    assert.equal(report.passed, false);
    const failed = report.results.filter((item) => !item.passed).map((item) => item.id);
    assert.ok(failed.includes("pages.no-typescript-source"));
    assert.ok(
      failed.includes("pages.mime") || failed.includes("pages.assets.present") || failed.includes("pages.assets.fetch"),
      `expected asset/mime failure, got ${failed.join(", ")}`
    );
  } finally {
    await server.close();
  }
});

test("docs-only targets are skipped without false healthy HTML-only pass", async () => {
  const report = await runPagesHealthChecks({
    name: "readme-site",
    kind: "docs-only",
    baseUrl: "https://example.test/"
  }, { skipBrowser: true });
  assert.equal(report.passed, true);
  assert.ok(report.results.some((item) => item.id === "pages.docs-only" && item.passed));
});
