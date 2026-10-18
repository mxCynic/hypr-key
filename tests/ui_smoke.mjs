#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const project = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(project, "..", "..");
const temp = await mkdtemp(path.join(os.tmpdir(), "hypr-keymap-ui-"));
const output = path.join(temp, "index.html");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForJson(url, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Chromium is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${url}`);
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.sequence = 0;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message);
    });
  }

  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.result.exceptionDetails) {
      throw new Error(response.result.exceptionDetails.text);
    }
    return response.result.result.value;
  }
}

let chromium;
try {
  await new Promise((resolve, reject) => {
    execFile(
      path.join(repo, "mxbin", "hypr-keymap"),
      ["-o", output, path.join(repo, "hypr", "configs", "binds.lua")],
      { env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
      (error) => (error ? reject(error) : resolve()),
    );
  });

  const port = await freePort();
  chromium = spawn(
    "chromium",
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${path.join(temp, "chromium")}`,
      `file://${output}`,
    ],
    { detached: true, stdio: "ignore" },
  );
  const pages = await waitForJson(`http://127.0.0.1:${port}/json`);
  const cdp = new Cdp(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.call("Runtime.enable");
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));

  const search = await cdp.evaluate(`(() => {
    const input = document.querySelector("#bind-search");
    input.value = "test-demo-10";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const rows = [...document.querySelectorAll(".search-result-row")];
    rows[0].click();
    return {
      rows: rows.length,
      query: input.value,
      popoverHidden: document.querySelector("#search-popover").hidden,
      detailTitle: document.querySelector("#detail-title").textContent,
      hash: location.hash,
    };
  })()`);
  assert(search.rows === 6, `expected 6 search results, got ${search.rows}`);
  assert(search.query === "test-demo-10", "search query was not preserved");
  assert(search.popoverHidden, "search popover did not close after selection");
  assert(search.detailTitle !== "搜索匹配", "search selection did not open key detail");
  assert(search.hash.includes("q=test-demo-10"), "search state was not written to the URL");

  const chordQueries = await cdp.evaluate(`(() => {
    const input = document.querySelector("#bind-search");
    return ["SUPER A", "SUPER + A", "super+a", "key:super+a"].map((query) => {
      input.value = query;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        query,
        count: document.querySelectorAll(".search-result-row").length,
        combo: document.querySelector(".search-result-row .search-result-combo")?.textContent,
      };
    });
  })()`);
  for (const result of chordQueries) {
    assert(result.count === 1, `${result.query} returned ${result.count} results`);
    assert(result.combo === "Super + A", `${result.query} did not resolve to Super + A`);
  }

  const fields = await cdp.evaluate(`(() => {
    const input = document.querySelector("#bind-search");
    input.value = "submap:resize flag:repeating";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return [...document.querySelectorAll(".search-result-row strong")].map((item) => item.textContent);
  })()`);
  assert(fields.length === 4, `field search returned ${fields.length} results`);

  const filters = await cdp.evaluate(`(() => {
    const input = document.querySelector("#bind-search");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    [...document.querySelectorAll(".search-filter")].find((item) => item.dataset.filter === "flags").click();
    return {
      rows: document.querySelectorAll(".search-result-row").length,
      active: document.querySelector(".search-filter.is-active")?.dataset.filter,
    };
  })()`);
  assert(filters.rows > 0, "flags filter returned no results");
  assert(filters.active === "flags", "flags filter was not activated");

  const marks = await cdp.evaluate(`(() => {
    const input = document.querySelector("#bind-search");
    input.value = "音量";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return document.querySelectorAll(".search-result-row mark").length;
  })()`);
  assert(marks > 0, "search matches were not highlighted");

  const layout = await cdp.evaluate(`(() => {
    const keyboard = document.querySelector(".keyboard-scroll");
    return {
      clientWidth: keyboard.clientWidth,
      scrollWidth: keyboard.scrollWidth,
      overflowHintHidden: document.querySelector("#keyboard-overflow-hint").hidden,
      submapsCollapsed: document.querySelector(".submap-list").hidden,
    };
  })()`);
  assert(layout.clientWidth === layout.scrollWidth, "keyboard did not fit at 1366px");
  assert(layout.overflowHintHidden, "overflow hint should be hidden when keyboard fits");
  assert(layout.submapsCollapsed, "large submap list should start collapsed");

  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const mobile = await cdp.evaluate(`(() => {
    const popover = document.querySelector("#search-popover");
    return {
      open: !popover.hidden,
      position: getComputedStyle(popover).position,
      width: Math.round(popover.getBoundingClientRect().width),
    };
  })()`);
  assert(mobile.open, "mobile search popover should be open");
  assert(mobile.position === "fixed", "mobile search popover is not a fixed drawer");
  assert(mobile.width < 390, "mobile search popover overflows the viewport");

  console.log("UI smoke test passed");
} finally {
  if (chromium?.pid) {
    try {
      process.kill(-chromium.pid, "SIGTERM");
    } catch {
      chromium.kill("SIGTERM");
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  await rm(temp, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
