import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MESSAGE_TYPES } from "../src/shared/messages.js";

test("options page exposes completed records, storage, color, and weekly controls", () => {
  const html = readFileSync("src/options/options.html", "utf8");

  for (const id of [
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

test("completed record edit failures show an error and restore the list", async (t) => {
  const page = await loadOptionsPage(t, {
    [MESSAGE_TYPES.UPDATE_COMPLETED_RECORD]: { ok: false, message: "Edit failed" }
  });
  const input = page.findByTag("input", page.elements.completedList);

  input.value = "Unsaved text";
  await input.dispatch("change");
  await flush();

  assert.equal(page.elements.completedFileStatus.textContent, "Edit failed");
  assert.equal(page.findByTag("input", page.elements.completedList).value, "Original task");
});

test("completed record delete failures show an error and keep the row", async (t) => {
  const page = await loadOptionsPage(t, {
    [MESSAGE_TYPES.DELETE_COMPLETED_RECORD]: { ok: false, message: "Delete failed" }
  });
  const deleteButton = page.findByText("删除", page.elements.completedList);

  await deleteButton.dispatch("click");
  await flush();

  assert.equal(page.elements.completedFileStatus.textContent, "Delete failed");
  assert.equal(page.findByTag("input", page.elements.completedList).value, "Original task");
});

test("completed record mutation failures keep the last successful list when refresh also fails", async (t) => {
  let readCount = 0;
  const page = await loadOptionsPage(t, {
    [MESSAGE_TYPES.UPDATE_COMPLETED_RECORD]: { ok: false, message: "Edit failed" },
    [MESSAGE_TYPES.READ_COMPLETED_DATA]: () => {
      readCount += 1;
      return readCount === 1
        ? completedReadResult()
        : { ok: false, message: "Read failed" };
    }
  });
  const input = page.findByTag("input", page.elements.completedList);

  input.value = "Unsaved text";
  await input.dispatch("change");
  await flush();

  assert.equal(page.elements.completedFileStatus.textContent, "Edit failed");
  assert.equal(page.findByTag("input", page.elements.completedList).value, "Original task");
});

test("completed file status keeps permission text after completed data refresh", async (t) => {
  const page = await loadOptionsPage(t);

  assert.equal(page.elements.completedFileStatus.textContent, "completed.json (granted)");
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

  assert.equal(page.elements.completedFileStatus.textContent, "completed.json (prompt)");
});

test("permission success updates status before any later refresh can fail", () => {
  const source = readFileSync("src/options/options.js", "utf8");

  assert.match(source, /elements\.requestCompletedPermission\.addEventListener\("click", async \(\) => \{[\s\S]*if \(result\.ok\) \{[\s\S]*applyCompletedStatus\(result\)[\s\S]*await refreshCompletedData\(\)/);
});

async function loadOptionsPage(t, overrides = {}) {
  const previousDocument = globalThis.document;
  const previousChrome = globalThis.chrome;
  const previousEcharts = globalThis.echarts;
  const previousAddEventListener = globalThis.addEventListener;
  const previousShowOpenFilePicker = globalThis.showOpenFilePicker;
  const previousShowSaveFilePicker = globalThis.showSaveFilePicker;
  const elements = Object.fromEntries([
    "addColorPreset",
    "colorPresetList",
    "completedFileStatus",
    "completedList",
    "completedSearch",
    "createCompletedFile",
    "pickCompletedFile",
    "requestCompletedPermission",
    "weeklyChart"
  ].map((id) => [id, new TestElement("div", id)]));
  elements.completedSearch.value = "";
  globalThis.document = {
    getElementById(id) {
      return elements[id] || null;
    },
    createElement(tagName) {
      return new TestElement(tagName);
    }
  };
  globalThis.chrome = {
    runtime: {
      sendMessage(message) {
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
  globalThis.showOpenFilePicker = undefined;
  globalThis.showSaveFilePicker = undefined;
  t.after(() => {
    globalThis.document = previousDocument;
    globalThis.chrome = previousChrome;
    globalThis.echarts = previousEcharts;
    globalThis.addEventListener = previousAddEventListener;
    globalThis.showOpenFilePicker = previousShowOpenFilePicker;
    globalThis.showSaveFilePicker = previousShowSaveFilePicker;
  });

  await import(`../src/options/options.js?test=${Date.now()}-${Math.random()}`);
  await flush();

  return {
    elements,
    findByTag(tagName, root) {
      return findElement(root, (element) => element.tagName === tagName);
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
      completed: [{ text: "Original task", completedAt: "2026-07-23T09:30:00.000Z" }]
    }
  };
}

class TestElement {
  constructor(tagName, id = "") {
    this.tagName = tagName;
    this.id = id;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.dateTime = "";
    this.type = "";
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
  }

  replaceChildren(...children) {
    this.children = children;
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

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}
