import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MESSAGE_TYPES } from "../src/shared/messages.js";

test("options page exposes completed records, storage, color, and weekly controls", () => {
  const html = readFileSync("src/options/options.html", "utf8");

  for (const id of [
    "ballSize",
    "ballSizePreview",
    "ballSizeValue",
    "completedSearch",
    "completedList",
    "pickCompletedFile",
    "createCompletedFile",
    "requestCompletedPermission",
    "colorPresetList",
    "addColorPreset",
    "weeklyChart"
  ]) {
    assert.equal(html.includes(`id="${id}"`), true);
  }

  assert.equal(html.includes("vendor/echarts.min.js"), true);
});

test("options page renders and saves the floating ball size setting", async (t) => {
  const html = readFileSync("src/options/options.html", "utf8");
  const css = readFileSync("src/options/options.css", "utf8");
  const page = await loadOptionsPage(t, {
    [MESSAGE_TYPES.GET_STATE]: {
      ok: true,
      settings: { ballSize: 52, ballThemeColor: "#78d9dd", colorPresets: ["#ffffff"] },
      completedStatus: { fileName: "completed.json", permission: "granted" }
    }
  });

  assert.match(html, /id="ballSize"[^>]*max="88"/);
  assert.equal(html.includes("<span>88px</span>"), true);
  assert.match(css, /\.ball-size-preview-shell\s*\{[\s\S]*width:\s*96px[\s\S]*height:\s*96px/);
  assert.match(css, /\.ball-size-preview-ball\s*\{[\s\S]*conic-gradient/);
  assert.doesNotMatch(css, /\.ball-size-preview-ball\s*\{[\s\S]*border:\s*3px/);
  assert.equal(page.elements.ballSize.value, "52");
  assert.equal(page.elements.ballSizeValue.textContent, "52px");
  assert.equal(page.elements.ballSizePreview.style["--preview-ball-size"], "52px");

  page.elements.ballSize.value = "60";
  await page.elements.ballSize.dispatch("input");
  await page.elements.ballSize.dispatch("change");
  await flush();

  assert.deepEqual(page.messages.filter((message) => message.type === MESSAGE_TYPES.UPDATE_SETTINGS).at(-1)?.payload, {
    ballSize: 60
  });
});

test("options page exposes the calm workspace layout hooks", () => {
  const html = readFileSync("src/options/options.html", "utf8");
  const css = readFileSync("src/options/options.css", "utf8");

  for (const className of [
    "todo-options-header",
    "todo-options-dashboard",
    "todo-options-primary",
    "todo-options-rail",
    "todo-options-summary"
  ]) {
    assert.equal(html.includes(`class="${className}"`), true);
    assert.match(css, new RegExp(`\\.${className}`));
  }
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+364px/);
});

test("options rail keeps controls in stable columns and wraps long completed-file status text", () => {
  const css = readFileSync("src/options/options.css", "utf8");

  assert.match(css, /\.control-row\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.status-text\s*\{[\s\S]*min-width:\s*0[\s\S]*overflow-wrap:\s*anywhere/);
});

test("options buttons retain an explicit keyboard focus indicator", () => {
  const css = readFileSync("src/options/options.css", "utf8");

  assert.match(css, /button:focus-visible,\s*input:focus-visible,\s*select:focus-visible\s*\{[\s\S]*outline:\s*3px solid #D7E5FF/i);
  assert.doesNotMatch(css, /button:hover,\s*button:focus-visible\s*\{[\s\S]*outline:\s*none/);
});

test("completed links are visually distinct before hover", () => {
  const css = readFileSync("src/options/options.css", "utf8");
  const linkRule = cssRule(css, ".completed-link");

  assert.match(linkRule, /color:\s*var\(--todo-blue\)/);
  assert.match(linkRule, /text-decoration:\s*underline/);
  assert.match(linkRule, /background:\s*#EEF5FF/i);
});

test("new completed-file button uses the neutral button style", () => {
  const css = readFileSync("src/options/options.css", "utf8");

  assert.match(css, /\.control-row button\s*\{[\s\S]*width:\s*100%/);
  assert.doesNotMatch(css, /#createCompletedFile\s*\{[\s\S]*background:\s*var\(--todo-blue\)/i);
  assert.match(css, /\.theme-manage-button\s*\{[\s\S]*background:\s*var\(--todo-blue\)/i);
});

test("color preset controls are compact swatches with a corner delete affordance", () => {
  const css = readFileSync("src/options/options.css", "utf8");

  assert.match(css, /\.color-preset-item\s*\{[\s\S]*width:\s*52px[\s\S]*height:\s*52px/);
  assert.match(css, /\.color-preset-delete\s*\{[\s\S]*position:\s*absolute[\s\S]*top:\s*-3px[\s\S]*right:\s*-2px/);
  assert.doesNotMatch(css, /\.color-picker-menu/);
  assert.doesNotMatch(css, /\.color-picker-choices/);
});

test("options page invokes completed-file picker APIs directly from click handlers", () => {
  const source = readFileSync("src/options/options.js", "utf8");
  const workerSource = readFileSync("src/background/service-worker.js", "utf8");

  assert.match(source, /from "\.\.\/shared\/completed-file-store\.js"/);
  assert.match(source, /pickCompletedJsonFile\(\)/);
  assert.match(source, /createCompletedJsonFile\(\)/);
  assert.match(source, /requestCompletedFilePermission\(\)/);
  assert.doesNotMatch(source, /sendMessage\(MESSAGE_TYPES\.(PICK_COMPLETED_FILE|CREATE_COMPLETED_FILE|REQUEST_COMPLETED_FILE_PERMISSION)/);
  assert.doesNotMatch(workerSource, /pickCompletedJsonFile|createCompletedJsonFile|requestCompletedFilePermission/);
});

test("options page reports picker and creation failures in the completed-file status", () => {
  const source = readFileSync("src/options/options.js", "utf8");

  assert.match(source, /function showCompletedFileResult\(result\)[\s\S]*completedFileStatus\.textContent\s*=\s*result\.message\s*\|\|\s*"Completed JSON file operation failed"/);
  assert.match(source, /elements\.pickCompletedFile\.addEventListener\("click", async \(\) => \{[\s\S]*showCompletedFileResult\(result\)/);
  assert.match(source, /elements\.createCompletedFile\.addEventListener\("click", async \(\) => \{[\s\S]*showCompletedFileResult\(result\)/);
});

test("options page refreshes file status after picker and creation successes", () => {
  const source = readFileSync("src/options/options.js", "utf8");

  assert.match(source, /function showCompletedFileResult\(result\)[\s\S]*if \(result\.ok\) \{[\s\S]*applyCompletedStatus\(result\)[\s\S]*await refreshCompletedData\(\)/);
  assert.doesNotMatch(source, /function showCompletedFileResult\(result\)[\s\S]*if \(result\.ok\) \{[\s\S]*await refreshState\(\)/);
});

test("options page sends color preset changes as a narrow settings patch", () => {
  const source = readFileSync("src/options/options.js", "utf8");

  assert.match(source, /sendMessage\(MESSAGE_TYPES\.UPDATE_SETTINGS,\s*\{\s*colorPresets\s*\}\)/);
  assert.doesNotMatch(source, /sendMessage\(MESSAGE_TYPES\.UPDATE_SETTINGS,\s*\{\s*\.\.\.settings,\s*colorPresets\s*\}\)/);
});

test("content script applies the saved floating ball size", () => {
  const source = readFileSync("src/content/content.js", "utf8");

  assert.match(source, /applyBallSize\(state\.settings\.ballSize\)/);
  assert.match(source, /function applyBallSize\(size\)[\s\S]*--todo-ball-size/);
});

test("options color presets use native color inputs and inline x delete", async (t) => {
  const page = await loadOptionsPage(t);
  const swatch = page.findByClass("color-swatch", page.elements.colorPresetList);

  swatch.value = "#22c55e";
  await swatch.dispatch("change");
  await flush();

  assert.equal(swatch.tagName, "input");
  assert.equal(swatch.type, "color");
  assert.equal(page.findByText("删除", page.elements.colorPresetList), null);
  assert.deepEqual(page.messages.find((message) => message.type === MESSAGE_TYPES.UPDATE_SETTINGS)?.payload.colorPresets, ["#22c55e"]);

  const deleteButton = page.findByClass("color-preset-delete", page.elements.colorPresetList);
  assert.equal(deleteButton.textContent, "x");
  await deleteButton.dispatch("click");
  await flush();

  assert.deepEqual(page.messages.filter((message) => message.type === MESSAGE_TYPES.UPDATE_SETTINGS).at(-1)?.payload.colorPresets, []);
});

test("add color preset appends a random color without prompting", async (t) => {
  const page = await loadOptionsPage(t);

  await page.elements.addColorPreset.dispatch("click");
  await flush();

  const updateMessage = page.messages.find((message) => message.type === MESSAGE_TYPES.UPDATE_SETTINGS);
  assert.equal(page.promptCalls.length, 0);
  assert.equal(updateMessage?.payload.colorPresets.length, 2);
  assert.equal(updateMessage?.payload.colorPresets[0], "#ffffff");
  assert.match(updateMessage?.payload.colorPresets[1], /^#[0-9a-f]{6}$/);
});

test("completed records render as read-only rows with optional duration", async (t) => {
  const page = await loadOptionsPage(t);

  assert.equal(page.findByTag("input", page.elements.completedList), null);
  assert.equal(page.findByClass("completed-text", page.elements.completedList).textContent, "Original task");
  assert.equal(page.findByClass("completed-duration", page.elements.completedList).textContent, "用时 1m 30s");
});

test("completed records render markdown and direct URL links as read-only rows", async (t) => {
  const page = await loadOptionsPage(t, {
    [MESSAGE_TYPES.READ_COMPLETED_DATA]: {
      ok: true,
      fileName: "completed.json",
      data: {
        version: 1,
        completed: [
          { text: "[Project Board](https://example.com/spec)", completedAt: "2026-07-23T09:30:00.000Z" },
          { text: "https://example.com/direct", completedAt: "2026-07-23T09:29:00.000Z" }
        ]
      }
    }
  });

  const links = page.findAllByClass("completed-link", page.elements.completedList);

  assert.equal(page.findByTag("input", page.elements.completedList), null);
  assert.equal(links.length, 2);
  assert.equal(links[0].tagName, "a");
  assert.equal(links[0].textContent, "Project Board");
  assert.equal(links[0].href, "https://example.com/spec");
  assert.equal(links[0].target, "_blank");
  assert.equal(links[0].rel, "noopener noreferrer");
  assert.equal(links[1].textContent, "https://example.com/direct");
  assert.equal(links[1].href, "https://example.com/direct");
});

test("completed record delete failures show an error and keep the row", async (t) => {
  const page = await loadOptionsPage(t, {
    [MESSAGE_TYPES.DELETE_COMPLETED_RECORD]: { ok: false, message: "Delete failed" }
  });
  const deleteButton = page.findByText("删除", page.elements.completedList);

  await deleteButton.dispatch("click");
  await flush();

  assert.equal(page.elements.completedFileStatus.textContent, "Delete failed");
  assert.equal(page.findByClass("completed-text", page.elements.completedList).textContent, "Original task");
});

test("completed record delete failures keep the last successful list when refresh also fails", async (t) => {
  let readCount = 0;
  const page = await loadOptionsPage(t, {
    [MESSAGE_TYPES.DELETE_COMPLETED_RECORD]: { ok: false, message: "Delete failed" },
    [MESSAGE_TYPES.READ_COMPLETED_DATA]: () => {
      readCount += 1;
      return readCount === 1
        ? completedReadResult()
        : { ok: false, message: "Read failed" };
    }
  });
  const deleteButton = page.findByText("删除", page.elements.completedList);

  await deleteButton.dispatch("click");
  await flush();

  assert.equal(page.elements.completedFileStatus.textContent, "Delete failed");
  assert.equal(page.findByClass("completed-text", page.elements.completedList).textContent, "Original task");
});

test("completed file status keeps permission text after completed data refresh", async (t) => {
  const page = await loadOptionsPage(t);

  assert.equal(page.elements.completedFileStatus.textContent, "最后更新：2026/7/23 17:30");
});

test("completed file status keeps prompt permission when completed data cannot be read", async (t) => {
  const page = await loadOptionsPage(t, {
    [MESSAGE_TYPES.GET_STATE]: {
      ok: true,
      settings: { colorPresets: ["#ffffff"] },
      completedStatus: { fileName: "completed.json", permission: "prompt" }
    },
    [MESSAGE_TYPES.READ_COMPLETED_DATA]: { ok: false, message: "Permission required" }
  });

  assert.equal(page.elements.completedFileStatus.textContent, "completed.json (prompt) - Permission required");
});

test("completed file read failures show the read error beside the bound file status", async (t) => {
  const page = await loadOptionsPage(t, {
    [MESSAGE_TYPES.READ_COMPLETED_DATA]: { ok: false, reason: "parse_error", message: "Completed JSON is invalid" }
  });

  assert.equal(page.elements.completedFileStatus.textContent, "completed.json (granted) - Completed JSON is invalid");
});

test("permission success updates status before any later refresh can fail", () => {
  const source = readFileSync("src/options/options.js", "utf8");

  assert.match(source, /elements\.requestCompletedPermission\.addEventListener\("click", async \(\) => \{[\s\S]*if \(result\.ok\) \{[\s\S]*applyCompletedStatus\(result\)[\s\S]*await refreshCompletedData\(\)/);
});

test("completed file picker result replaces stale records before a later refresh fails", () => {
  const source = readFileSync("src/options/options.js", "utf8");

  assert.match(source, /function showCompletedFileResult\(result\)[\s\S]*applyCompletedStatus\(result\)[\s\S]*if \(result\.data\)[\s\S]*applyCompletedData\(result\.data\)/);
});

test("completed record mutations are ignored while another mutation is pending", async (t) => {
  const releaseUpdates = [];
  let deleteCalls = 0;
  const page = await loadOptionsPage(t, {
    [MESSAGE_TYPES.DELETE_COMPLETED_RECORD]: () => {
      deleteCalls += 1;
      return new Promise((resolve) => { releaseUpdates.push(() => resolve({ ok: true })); });
    }
  });
  const deleteButton = page.findByText("删除", page.elements.completedList);

  const first = deleteButton.dispatch("click");
  await flush();
  const second = deleteButton.dispatch("click");
  await flush();
  for (const releaseUpdate of releaseUpdates) releaseUpdate();
  await Promise.all([first, second]);
  await flush();

  assert.equal(deleteCalls, 1);
});

async function loadOptionsPage(t, overrides = {}) {
  const previousDocument = globalThis.document;
  const previousChrome = globalThis.chrome;
  const previousEcharts = globalThis.echarts;
  const previousAddEventListener = globalThis.addEventListener;
  const previousShowOpenFilePicker = globalThis.showOpenFilePicker;
  const previousShowSaveFilePicker = globalThis.showSaveFilePicker;
  const previousPrompt = globalThis.prompt;
  const elements = Object.fromEntries([
    "addColorPreset",
    "averageDailyCount",
    "ballSize",
    "ballSizePreview",
    "ballSizeValue",
    "ballThemeColor",
    "colorPresetList",
    "completedFileName",
    "completedFileStatus",
    "completedList",
    "completedPermissionBadge",
    "completedSearch",
    "createCompletedFile",
    "pickCompletedFile",
    "requestCompletedPermission",
    "scheduledTaskForm",
    "scheduledTaskFrequency",
    "scheduledTaskList",
    "scheduledTaskMonthday",
    "scheduledTaskMonthdayField",
    "scheduledTaskText",
    "scheduledTaskTime",
    "scheduledTaskWeekday",
    "scheduledTaskWeekdayField",
    "streakDays",
    "todayCompletedCount",
    "todayCompletedDelta",
    "weekCompletedCount",
    "weekCompletionProgress",
    "weekCompletionRate",
    "weeklyChart",
    "weeklyWeekSelect"
  ].map((id) => [id, new TestElement("div", id)]));
  elements.ballThemeColor.value = "#2563eb";
  elements.ballSize.value = "44";
  const messages = [];
  const promptCalls = [];
  const classElements = {
    ".todo-options-lower": new TestElement("div", "optionsLower"),
    ".todo-rail-theme-preview": new TestElement("div", "railThemePreview")
  };
  const frequencyButtons = ["workday", "weekly", "monthly"].map((frequency) => {
    const button = new TestElement("button");
    button.dataset.frequency = frequency;
    return button;
  });
  elements.completedSearch.value = "";
  elements.scheduledTaskFrequency.value = "workday";
  elements.scheduledTaskTime.value = "09:00";
  elements.scheduledTaskMonthday.options = [];
  globalThis.document = {
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector(selector) {
      return classElements[selector] || null;
    },
    querySelectorAll(selector) {
      return selector === "[data-frequency]" ? frequencyButtons : [];
    },
    createElement(tagName) {
      return new TestElement(tagName);
    }
  };
  globalThis.chrome = {
    runtime: {
      sendMessage(message) {
        messages.push(message);
        if (overrides[message.type]) {
          const override = overrides[message.type];
          return Promise.resolve(typeof override === "function" ? override(message) : override);
        }
        if (message.type === MESSAGE_TYPES.GET_STATE) {
          return Promise.resolve({
            ok: true,
            settings: { colorPresets: ["#ffffff"] },
            completedStatus: { fileName: "completed.json", permission: "granted" }
          });
        }
        if (message.type === MESSAGE_TYPES.READ_COMPLETED_DATA) {
          return Promise.resolve(completedReadResult());
        }
        return Promise.resolve({ ok: true });
      }
    }
  };
  globalThis.echarts = null;
  globalThis.addEventListener = () => {};
  globalThis.matchMedia = () => ({ matches: true });
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.prompt = (...args) => {
    promptCalls.push(args);
    return "#abcdef";
  };
  globalThis.showOpenFilePicker = undefined;
  globalThis.showSaveFilePicker = undefined;
  t.after(() => {
    globalThis.document = previousDocument;
    globalThis.chrome = previousChrome;
    globalThis.echarts = previousEcharts;
    globalThis.addEventListener = previousAddEventListener;
    globalThis.prompt = previousPrompt;
    globalThis.showOpenFilePicker = previousShowOpenFilePicker;
    globalThis.showSaveFilePicker = previousShowSaveFilePicker;
  });

  await import(`../src/options/options.js?test=${Date.now()}-${Math.random()}`);
  await flush();

  return {
    elements,
    messages,
    promptCalls,
    findByTag(tagName, root) {
      return findElement(root, (element) => element.tagName === tagName);
    },
    findByClass(className, root) {
      return findElement(root, (element) => element.className.split(" ").includes(className));
    },
    findAllByClass(className, root) {
      return findElements(root, (element) => element.className.split(" ").includes(className));
    },
    findByText(text, root) {
      return findElement(root, (element) => element.textContent === text);
    }
  };
}

function completedReadResult() {
  return {
    ok: true,
    fileName: "completed.json",
    data: {
      version: 1,
      completed: [{ text: "Original task", completedAt: "2026-07-23T09:30:00.000Z", durationMs: 90000 }]
    }
  };
}

class TestElement {
  constructor(tagName, id = "") {
    this.tagName = tagName;
    this.id = id;
    this.children = [];
    this.listeners = {};
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.attributes = {};
    this.dataset = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.dateTime = "";
    this.type = "";
    this.hidden = false;
    this.disabled = false;
    this.options = [];
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  async dispatch(type, event = {}) {
    await this.listeners[type]?.({ target: this, ...event });
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  append(...children) {
    this.children.push(...children);
    for (const child of children) {
      if (child.tagName === "option") this.options.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = children;
    this.options = children.filter((child) => child.tagName === "option");
  }

  reportValidity() {
    return true;
  }

  reset() {
    this.value = "";
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200 };
  }
}

function findElement(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children || []) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}

function findElements(root, predicate, matches = []) {
  if (predicate(root)) matches.push(root);
  for (const child of root.children || []) findElements(child, predicate, matches);
  return matches;
}

function cssRule(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] || "";
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}
