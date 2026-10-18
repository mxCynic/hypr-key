#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const project = path.resolve(import.meta.dirname, "..");
const fixture = path.join(project, "tests", "fixtures", "hyprland.lua");
const temp = await mkdtemp(path.join(os.tmpdir(), "hypr-keymap-ui-"));
const output = path.join(temp, "index.html");
const diagnosticSource = path.join(temp, "diagnostics.lua");
const diagnosticOutput = path.join(temp, "diagnostics.html");

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

async function waitForValue(cdp, expression, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const value = await cdp.evaluate(expression);
      if (value) return value;
    } catch {
      // The page may still be navigating.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${expression}`);
}

function generateHtml(outputPath, sourcePath) {
  return new Promise((resolve, reject) => {
    execFile(
      "uv",
      ["run", "--offline", "--project", project, "hypr-keymap", "-o", outputPath, sourcePath],
      { env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
      (error) => (error ? reject(error) : resolve()),
    );
  });
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
  await generateHtml(output, fixture);

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
  await cdp.call("Page.enable");
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));

  const initialLanguage = await cdp.evaluate(`(() => {
    const switchRect = document.querySelector(".language-switch").getBoundingClientRect();
    return {
      lang: document.documentElement.lang,
      title: document.title,
      hero: document.querySelector("[data-i18n='hero.title']").textContent,
      active: document.querySelector(".language-switch .is-active")?.dataset.lang,
      pressed: document.querySelector("[data-lang='en']").getAttribute("aria-pressed"),
      switchVisible: switchRect.width > 0 && switchRect.height > 0,
      subtitle: document.querySelector("#detail-subtitle").textContent,
      submapHeading: document.querySelector(".submap-index-head span").textContent,
      clean: document.querySelector(".diagnostics-clean span")?.textContent,
      descriptions: [...document.querySelectorAll(".binding-title")].map((item) => item.firstChild?.textContent || ""),
      langParam: new URLSearchParams(location.hash.slice(1)).get("lang"),
    };
  })()`);
  assert(initialLanguage.lang === "en", "the page did not default to English");
  assert(initialLanguage.title === "Hyprland Keymap Audit", "English document title is missing");
  assert(initialLanguage.hero === "Keymap Audit", "English hero title is missing");
  assert(initialLanguage.active === "en", "EN is not the active language button");
  assert(initialLanguage.pressed === "true", "EN language button is not pressed");
  assert(initialLanguage.switchVisible, "language switch is not visible");
  assert(initialLanguage.subtitle.startsWith("This key has"), "dynamic detail copy is not English");
  assert(initialLanguage.submapHeading === "SUBMAP navigation", "submap navigation is not English");
  assert(
    initialLanguage.clean === "No duplicate bindings or obvious configuration issues found.",
    "diagnostics empty state is not English",
  );
  assert(initialLanguage.langParam === null, "default English should not add a lang URL parameter");

  const chineseUi = await cdp.evaluate(`(() => {
    document.querySelector("[data-lang='zh']").click();
    return {
      lang: document.documentElement.lang,
      title: document.title,
      hero: document.querySelector("[data-i18n='hero.title']").textContent,
      active: document.querySelector(".language-switch .is-active")?.dataset.lang,
      subtitle: document.querySelector("#detail-subtitle").textContent,
      submapHeading: document.querySelector(".submap-index-head span").textContent,
      clean: document.querySelector(".diagnostics-clean span")?.textContent,
      descriptions: [...document.querySelectorAll(".binding-title")].map((item) => item.firstChild?.textContent || ""),
      langParam: new URLSearchParams(location.hash.slice(1)).get("lang"),
      stored: localStorage.getItem("hypr-keymap-language"),
    };
  })()`);
  assert(chineseUi.lang === "zh", "switching to Chinese did not update <html lang>");
  assert(chineseUi.title === "Hyprland 键位审计", "Chinese document title is missing");
  assert(chineseUi.hero === "键位审计", "Chinese hero title is missing");
  assert(chineseUi.active === "zh", "Chinese language button did not become active");
  assert(chineseUi.subtitle.includes("这个键参与"), "dynamic detail copy did not switch to Chinese");
  assert(chineseUi.submapHeading === "SUBMAP 导航", "submap navigation did not switch to Chinese");
  assert(chineseUi.clean.includes("未发现重复键位"), "diagnostics empty state did not switch to Chinese");
  assert(chineseUi.langParam === "zh", "Chinese locale was not persisted in the URL");
  assert(chineseUi.stored === "zh", "Chinese locale was not stored locally");
  assert(
    JSON.stringify(chineseUi.descriptions) === JSON.stringify(initialLanguage.descriptions),
    "binding descriptions changed when the UI language changed",
  );

  const baseUrl = await cdp.evaluate("location.href.split('#')[0]");
  await cdp.call("Page.navigate", { url: baseUrl });
  await waitForValue(
    cdp,
    `document.readyState === "complete" && document.documentElement.lang === "zh"`,
  );
  const reloadedLanguage = await cdp.evaluate(`({
    lang: document.documentElement.lang,
    active: document.querySelector(".language-switch .is-active")?.dataset.lang,
    descriptions: [...document.querySelectorAll(".binding-title")].map((item) => item.firstChild?.textContent || ""),
  })`);
  assert(reloadedLanguage.lang === "zh", "stored Chinese locale did not survive reload");
  assert(reloadedLanguage.active === "zh", "Chinese button was not restored after reload");
  assert(
    JSON.stringify(reloadedLanguage.descriptions) === JSON.stringify(initialLanguage.descriptions),
    "binding descriptions changed after a language reload",
  );

  const restoredEnglish = await cdp.evaluate(`(() => {
    document.querySelector("[data-lang='en']").click();
    return {
      lang: document.documentElement.lang,
      active: document.querySelector(".language-switch .is-active")?.dataset.lang,
      hero: document.querySelector("[data-i18n='hero.title']").textContent,
      descriptions: [...document.querySelectorAll(".binding-title")].map((item) => item.firstChild?.textContent || ""),
      langParam: new URLSearchParams(location.hash.slice(1)).get("lang"),
      stored: localStorage.getItem("hypr-keymap-language"),
    };
  })()`);
  assert(restoredEnglish.lang === "en", "switching back did not restore English");
  assert(restoredEnglish.active === "en", "EN button did not become active again");
  assert(restoredEnglish.hero === "Keymap Audit", "English hero title was not restored");
  assert(restoredEnglish.langParam === null, "English locale left a lang URL parameter");
  assert(restoredEnglish.stored === "en", "English locale was not stored locally");
  assert(
    JSON.stringify(restoredEnglish.descriptions) === JSON.stringify(initialLanguage.descriptions),
    "binding descriptions changed when switching back to English",
  );

  const moduleResolution = await cdp.evaluate(`(() => {
    [...document.querySelectorAll("[data-target]")].find(
      (item) => item.dataset.target === "Q",
    ).click();
    return {
      command: document.querySelector(".command code").textContent,
      source: document.querySelector(".binding-meta span").textContent,
    };
  })()`);
  assert(
    moduleResolution.command === "kitty",
    `required Lua module result was not used: ${moduleResolution.command}`,
  );
  assert(
    moduleResolution.source.startsWith("configs/binds.lua:"),
    `binding source is not the required module: ${moduleResolution.source}`,
  );

  const longKeyLabels = await cdp.evaluate(`(() => {
    const measure = (target) => {
      const button = [...document.querySelectorAll("[data-target]")].find(
        (item) => item.dataset.target === target,
      );
      button.click();
      const cap = document.querySelector("#selected-cap");
      const title = document.querySelector("#detail-title");
      return {
        target,
        cap: {
          clientWidth: cap.clientWidth,
          scrollWidth: cap.scrollWidth,
          clientHeight: cap.clientHeight,
          scrollHeight: cap.scrollHeight,
        },
        title: {
          clientWidth: title.clientWidth,
          scrollWidth: title.scrollWidth,
          clientHeight: title.clientHeight,
          scrollHeight: title.scrollHeight,
        },
        combos: [...document.querySelectorAll(".combo kbd.main")].map((item) => ({
          clientWidth: item.clientWidth,
          scrollWidth: item.scrollWidth,
          clientHeight: item.clientHeight,
          scrollHeight: item.scrollHeight,
        })),
        scopeCaptions: [...document.querySelectorAll(".binding-scope-item span")].map(
          (item) => item.textContent,
        ),
        flagCodes: [...document.querySelectorAll(".flag-pill code")].map((item) => item.textContent),
      };
    };
    return [measure("mouse:272"), measure("XF86AudioPrev")];
  })()`);
  for (const result of longKeyLabels) {
    assert(
      result.cap.scrollWidth <= result.cap.clientWidth + 1
        && result.cap.scrollHeight <= result.cap.clientHeight + 1,
      `${result.target} overflows the selected key cap`,
    );
    assert(
      result.title.scrollWidth <= result.title.clientWidth + 1,
      `${result.target} overflows the detail title`,
    );
    for (const keycap of result.combos) {
      assert(
        keycap.scrollWidth <= keycap.clientWidth + 1
          && keycap.scrollHeight <= keycap.clientHeight + 1,
        `${result.target} overflows a combination keycap`,
      );
    }
    assert(
      !result.scopeCaptions.includes("Trigger"),
      `${result.target} still shows the redundant trigger field`,
    );
  }
  assert(
    longKeyLabels[0].flagCodes.includes("mouse"),
    "mouse binding flags are missing from the detail card",
  );
  assert(
    longKeyLabels[1].flagCodes.includes("locked"),
    "non-trigger flags are missing from the detail card",
  );

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

  const localizedSearch = await cdp.evaluate(`(() => {
    const before = [...document.querySelectorAll(".search-result-row strong")].map((item) => item.textContent);
    document.querySelector("[data-lang='zh']").click();
    const chinese = {
      open: !document.querySelector("#search-popover").hidden,
      query: document.querySelector("#bind-search").value,
      count: document.querySelector("#search-popover-count").textContent,
      titles: [...document.querySelectorAll(".search-result-row strong")].map((item) => item.textContent),
    };
    document.querySelector("[data-lang='en']").click();
    return { before, chinese };
  })()`);
  assert(localizedSearch.chinese.open, "language switch closed the search popover");
  assert(localizedSearch.chinese.query === "音量", "language switch cleared the search query");
  assert(localizedSearch.chinese.count.includes("条"), "search result count did not switch to Chinese");
  assert(
    JSON.stringify(localizedSearch.chinese.titles) === JSON.stringify(localizedSearch.before),
    "search result descriptions changed with the language",
  );

  const submapRoles = await cdp.evaluate(`(() => {
    const key = (target) => [...document.querySelectorAll(".key")].find(
      (item) => item.dataset.target === target,
    );
    const role = (element) => ({
      entry: element.classList.contains("is-submap-entry"),
      entryModifier: element.classList.contains("is-submap-entry-modifier"),
      exit: element.classList.contains("is-submap-exit"),
      exitModifier: element.classList.contains("is-submap-exit-modifier"),
      memberClass: element.classList.contains("is-submap-member"),
      outlineColor: getComputedStyle(element).outlineColor,
      outlineStyle: getComputedStyle(element).outlineStyle,
      borderColor: getComputedStyle(element).borderTopColor,
    });
    document.querySelector(".submap-overview-button").click();
    const ordinary = [...document.querySelectorAll(".key.has-binding")].find(
      (item) => !item.classList.contains("is-submap-entry")
        && !["SUPER", "CTRL", "ALT", "SHIFT"].includes(item.dataset.target),
    );
    const overview = {
      entry: role(key("R")),
      modifier: role(key("SUPER")),
      ordinary: role(ordinary),
    };
    [...document.querySelectorAll(".submap-card")].find(
      (item) => item.querySelector("strong")?.textContent === "resize",
    ).click();
    const inside = {
      member: role(key("L")),
      exit: role(key("R")),
      exitModifier: role(key("SUPER")),
    };
    return { overview, inside };
  })()`);
  assert(submapRoles.overview.entry.entry, "overview entry main key is not highlighted");
  assert(
    submapRoles.overview.modifier.entryModifier,
    "overview entry modifier is not distinguished from the main entry key",
  );
  assert(
    submapRoles.overview.entry.outlineColor !== submapRoles.overview.modifier.outlineColor,
    "entry key and its modifier use the same highlight color",
  );
  assert(
    submapRoles.overview.ordinary.outlineStyle === "none",
    "ordinary bound keys unexpectedly use the submap entry outline",
  );
  assert(
    !submapRoles.inside.member.memberClass
      && submapRoles.inside.member.outlineStyle === "none"
      && submapRoles.inside.member.borderColor === submapRoles.overview.ordinary.borderColor,
    "submap members do not use the ordinary binding style",
  );
  assert(
    submapRoles.inside.exit.exit
      && submapRoles.inside.exit.outlineColor === submapRoles.overview.entry.outlineColor,
    "submap exit does not use the same color as the entry key",
  );
  assert(
    submapRoles.inside.exitModifier.exitModifier
      && submapRoles.inside.exitModifier.outlineColor
        === submapRoles.overview.modifier.outlineColor,
    "submap exit modifier does not use the same color as the entry modifier",
  );

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

  const submapExit = await cdp.evaluate(`(() => {
    document.querySelector(".submap-toggle").click();
    const card = [...document.querySelectorAll(".submap-card")].find((item) => item.innerText.includes("resize"));
    card.click();
    const exitKey = [...document.querySelectorAll(".key")].find((item) => item.dataset.target === "R");
    const exitMarked = exitKey.classList.contains("is-submap-exit");
    exitKey.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    return {
      exitMarked,
      modeBarHidden: document.querySelector("#keyboard-filter").hidden,
    };
  })()`);
  assert(submapExit.exitMarked, "submap exit key was not marked");
  assert(submapExit.modeBarHidden, "double-clicking submap exit did not return to global view");

  await cdp.evaluate(`(() => {
    const input = document.querySelector("#bind-search");
    input.value = "音量";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);

  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const mobile = await cdp.evaluate(`(() => {
    const popover = document.querySelector("#search-popover");
    const language = document.querySelector(".language-switch").getBoundingClientRect();
    const source = document.querySelector(".source-note").getBoundingClientRect();
    return {
      open: !popover.hidden,
      position: getComputedStyle(popover).position,
      width: Math.round(popover.getBoundingClientRect().width),
      languageInside: language.left >= 0 && language.right <= innerWidth,
      headerOverlap: language.bottom > source.top && language.top < source.bottom,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  })()`);
  assert(mobile.open, "mobile search popover should be open");
  assert(mobile.position === "fixed", "mobile search popover is not a fixed drawer");
  assert(mobile.width < 390, "mobile search popover overflows the viewport");
  assert(mobile.languageInside, "mobile language switch overflows the viewport");
  assert(!mobile.headerOverlap, "mobile language switch overlaps the source note");
  assert(
    mobile.pageWidth <= mobile.viewportWidth,
    `mobile page overflows horizontally: ${mobile.pageWidth} > ${mobile.viewportWidth}`,
  );

  await writeFile(
    diagnosticSource,
    [
      'hl.bind("SUPER + A", hl.dsp.exec_cmd("one"), { description = "First action", mystery = true })',
      'hl.bind("SUPER + A", hl.dsp.exec_cmd("two"), { description = "Second action" })',
      'hl.bind("SUPER + SHIFT + B", hl.dsp.exec_cmd("three"), "bad-options")',
      'hl.bind("SUPER + R", hl.dsp.exec_cmd("four"), { description = "Release action", release = true })',
      "",
    ].join("\n"),
    "utf8",
  );
  await generateHtml(diagnosticOutput, diagnosticSource);
  await cdp.call("Page.navigate", { url: `file://${diagnosticOutput}` });
  await waitForValue(cdp, `document.readyState === "complete" && document.querySelectorAll(".diagnostic").length === 3`);

  const diagnosticEnglish = await cdp.evaluate(`({
    titles: [...document.querySelectorAll(".diagnostic-title")].map((item) => item.textContent),
    messages: [...document.querySelectorAll(".diagnostic p")].map((item) => item.textContent),
    locations: [...document.querySelectorAll(".diagnostic-meta span")].map((item) => item.textContent),
    descriptions: [...document.querySelectorAll(".binding-title")].map((item) => item.firstChild?.textContent || ""),
  })`);
  assert(
    diagnosticEnglish.titles.some((title) => title.includes("Unknown bind flag: mystery")),
    "unknown flag diagnostic is not localized to English",
  );
  assert(
    diagnosticEnglish.titles.some((title) => title.includes("Duplicate binding: Super + A")),
    "duplicate binding diagnostic is not localized to English",
  );
  assert(
    diagnosticEnglish.titles.some((title) => title.includes("Invalid bind options")),
    "invalid options diagnostic is not localized to English",
  );
  assert(
    diagnosticEnglish.messages.every((message) => !/\p{Script=Han}/u.test(message)),
    `English diagnostics still contain Chinese text: ${JSON.stringify(diagnosticEnglish.messages)}`,
  );
  assert(
    JSON.stringify(diagnosticEnglish.descriptions) === JSON.stringify(["First action", "Second action"]),
    "diagnostic page did not preserve binding descriptions",
  );
  assert(
    diagnosticEnglish.locations.length > 0
      && diagnosticEnglish.locations.every((location) => location.startsWith("diagnostics.lua:")),
    `diagnostic source locations are incorrect: ${JSON.stringify(diagnosticEnglish.locations)}`,
  );

  const diagnosticChinese = await cdp.evaluate(`(() => {
    document.querySelector("[data-lang='zh']").click();
    return {
      titles: [...document.querySelectorAll(".diagnostic-title")].map((item) => item.textContent),
      messages: [...document.querySelectorAll(".diagnostic p")].map((item) => item.textContent),
      descriptions: [...document.querySelectorAll(".binding-title")].map((item) => item.firstChild?.textContent || ""),
    };
  })()`);
  assert(
    diagnosticChinese.titles.some((title) => title.includes("未知 bind flag")),
    "unknown flag diagnostic did not switch to Chinese",
  );
  assert(
    diagnosticChinese.titles.some((title) => title.includes("重复键位")),
    "duplicate binding diagnostic did not switch to Chinese",
  );
  assert(
    diagnosticChinese.messages.every((message) => /\p{Script=Han}/u.test(message)),
    "Chinese diagnostics did not switch back to Chinese",
  );
  assert(
    JSON.stringify(diagnosticChinese.descriptions) === JSON.stringify(["First action", "Second action"]),
    "diagnostics language switch changed binding descriptions",
  );

  const triggerFlags = await cdp.evaluate(`(() => {
    document.querySelector("[data-lang='en']").click();
    [...document.querySelectorAll("[data-target]")].find(
      (item) => item.dataset.target === "R",
    ).click();
    return {
      captions: [...document.querySelectorAll(".binding-scope-item span")].map((item) => item.textContent),
      flagCodes: [...document.querySelectorAll(".flag-pill code")].map((item) => item.textContent),
    };
  })()`);
  assert(
    !triggerFlags.captions.includes("Trigger"),
    "trigger field remained after removing the redundant detail row",
  );
  assert(
    triggerFlags.flagCodes.includes("release"),
    "release flag is not shown in the flags list",
  );

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
