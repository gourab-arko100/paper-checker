import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { setTimeout } from "node:timers/promises";

const require = createRequire(import.meta.url);
const probe = createServer().listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
probe.close();
await once(probe, "close");
const base = "http://127.0.0.1:" + port;
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "start",
    "-H",
    "127.0.0.1",
    "-p",
    String(port),
  ],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: "",
      NEXT_PUBLIC_APP_URL: base,
    },
    stdio: ["ignore", "ignore", "inherit"],
  },
);
try {
  let home;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      home = await fetch(base, {
        redirect: "manual",
        signal: AbortSignal.timeout(2000),
      });
      break;
    } catch {
      await setTimeout(150);
    }
  }
  assert.equal(home?.status, 200);
  const markup = await home.text();
  assert.match(markup, /Understand Your Writing/);
  assert.match(markup, /<title>Paper Checker · Academic Writing Analysis<\/title>/);
  assert.match(markup, /rel="icon" href="\/favicon\.ico/);
  const icon = await fetch(base + "/favicon.ico");
  assert.equal(icon.status, 200);
  assert.deepEqual(Array.from(new Uint8Array(await icon.arrayBuffer()).slice(0, 4)), [0, 0, 1, 0]);
  for (const section of ["features", "how-it-works", "methodology", "faq"]) {
    assert.ok(markup.includes('id="' + section + '"'), section);
    assert.ok(markup.includes('href="/#' + section + '"'), section);
    const oldPage = await fetch(base + "/" + section, { redirect: "manual" });
    assert.equal(oldPage.status, 308, section);
    const target = new URL(oldPage.headers.get("location"), base);
    assert.equal(target.pathname + target.hash, "/#" + section);
  }
  assert.match(
    home.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  for (const path of [
    "about",
    "privacy",
    "terms",
    "sign-in",
    "sign-up",
  ]) {
    assert.equal((await fetch(base + "/" + path)).status, 200, path);
  }
  for (const path of [
    "/dashboard",
    "/analyze",
    "/history",
    "/compare",
    "/settings",
    "/admin",
    "/admin/usage",
    "/results/00000000-0000-4000-8000-000000000000",
  ]) {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.equal(response.status, 307, path);
    const destination = new URL(response.headers.get("location"), base);
    assert.equal(destination.pathname, "/sign-in");
    assert.equal(destination.searchParams.get("redirect_url"), path);
  }
  const write = (method, path, origin = base) =>
    fetch(base + path, {
      method,
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: "{}",
    });
  assert.equal((await write("POST", "/api/analyze")).status, 401);
  assert.equal((await write("PATCH", "/api/analyze")).status, 401);
  assert.equal((await write("DELETE", "/api/scans")).status, 401);
  assert.equal((await write("PATCH", "/api/preferences")).status, 401);
  assert.equal((await write("DELETE", "/api/account")).status, 401);
  assert.equal(
    (await write("POST", "/api/analyze", "https://example.org")).status,
    403,
  );
  console.log(
    "Production smoke checks passed for public pages, protected routes, admin routes and API authorization.",
  );
} finally {
  child.kill();
}
