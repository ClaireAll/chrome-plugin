# Todo Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `todo/` Chrome Manifest V3 extension described in `docs/superpowers/specs/2026-07-23-todo-extension-design.md`.

**Architecture:** Use the repository's existing lightweight extension pattern: native JavaScript and CSS, a Manifest V3 module service worker, a content script for the floating todo panel, and an options page for management. Keep durable completed history behind a completed-history store interface so MVP uses local JSON and future remote storage can reuse the same boundary.

**Tech Stack:** Chrome Manifest V3, native ES modules, `chrome.storage.local`, `chrome.alarms`, `chrome.notifications`, IndexedDB for file handles, File System Access API, Node's built-in `node:test`, local `vendor/echarts.min.js`.

## Global Constraints

- Implement inside `D:\Claire\chrome-plugin\todo`.
- Use native JavaScript and CSS; do not add React, Vite, or a build pipeline for MVP.
- Use Manifest V3.
- The floating ball appears on ordinary pages through a content script matched on `"<all_urls>"`.
- The floating panel target size is approximately `420 x 560`.
- The ball center displays the unfinished todo count.
- Ball dragging is free-form, with edge snapping only when released near a viewport edge.
- Unfinished todos, selected colors, reminders, settings, sort order, and ball position are stored in `chrome.storage.local`.
- Completed records are written only when the user clicks the complete button.
- Completed JSON records contain only `text` and `completedAt`.
- Completion buttons use `✔️`; delete buttons use `❌`.
- Deleting an unfinished todo requires no confirmation.
- Drag sorting persists when the panel closes.
- Reminder notifications fire once only when Chrome is running and the alarm handler is on time.
- A reminder alarm handler more than two minutes early or late is ignored and leaves the item eligible for a matching alarm.
- Notification clicks perform no action.
- Management search filters completed records by text only.
- Management can edit completed record text and delete one completed record.
- Color presets are managed in the options page and are not written to completed JSON.
- Weekly summary is computed dynamically from completed JSON and is not saved.
- Weekly summary uses local ECharts; no remote CDN script is loaded at runtime.
- Remote file read/write is out of scope; keep only an adapter boundary.
- Prefix local commands with `rtk` in this repository.

---

## File Map

- Create `todo/manifest.json`: MV3 metadata, permissions, content script, background worker, options page, icons/action title if assets are added later.
- Create `todo/package.json`: `node --test` and `node --check` scripts matching this repo's existing plugins.
- Create `todo/README.md`: load-unpacked instructions, JSON binding behavior, reminder limitations, weekly summary note.
- Create `todo/vendor/echarts.min.js`: vendored browser bundle, used by `src/options/options.html`.
- Create `todo/src/shared/messages.js`: message type constants and small response helpers.
- Create `todo/src/shared/domain.js`: pure todo and completed-history transformations.
- Create `todo/src/shared/settings.js`: default settings and sanitizers.
- Create `todo/src/shared/storage.js`: `chrome.storage.local` wrapper for unfinished todos and settings.
- Create `todo/src/shared/completed-file-store.js`: local JSON file binding, IndexedDB file handle storage, JSON read/write.
- Create `todo/src/shared/data-location.js`: completed-history adapter facade for local JSON now and remote later.
- Create `todo/src/shared/reminder-schedule.js`: alarm name helpers and reminder due checks.
- Create `todo/src/shared/weekly-summary.js`: current-week filtering and ECharts heatmap data shaping.
- Create `todo/src/background/service-worker.js`: message router, mutations, complete action, alarm/notification handling.
- Create `todo/src/content/content.js`: injected ball and panel UI.
- Create `todo/src/content/content.css`: namespaced panel and ball styles.
- Create `todo/src/options/options.html`: management page markup and local ECharts script include.
- Create `todo/src/options/options.css`: management layout, records, color presets, weekly summary sizing.
- Create `todo/src/options/options.js`: completed record management, JSON binding, settings, weekly summary chart rendering.
- Create `todo/test/*.test.mjs`: Node tests for manifest, shared pure helpers, store adapters with stubs, service worker behavior, and static UI contracts.

---

### Task 1: Scaffold Extension Shell And Contracts

**Files:**
- Create: `todo/manifest.json`
- Create: `todo/package.json`
- Create: `todo/README.md`
- Create: `todo/src/shared/messages.js`
- Create: `todo/src/background/service-worker.js`
- Create: `todo/src/content/content.js`
- Create: `todo/src/content/content.css`
- Create: `todo/src/options/options.html`
- Create: `todo/src/options/options.css`
- Create: `todo/src/options/options.js`
- Create: `todo/test/manifest.test.mjs`
- Create: `todo/test/service-worker-import.test.mjs`

**Interfaces:**
- Produces: `MESSAGE_TYPES` object exported from `src/shared/messages.js`.
- Produces: `success(payload = {})` and `failure(reason, message, extra = {})` helpers from `src/shared/messages.js`.
- Produces: baseline extension files that later tasks can import.

- [ ] **Step 1: Write the manifest and service worker import tests**

Create `todo/test/manifest.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appendCompletedRecord, createEmptyCompletedData } from "../src/shared/domain.js";

test("manifest injects the todo content script into ordinary pages", () => {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ["alarms", "notifications", "storage"].sort());
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["<all_urls>"]);
  assert.deepEqual(manifest.content_scripts[0].js, ["src/content/content.js"]);
  assert.deepEqual(manifest.content_scripts[0].css, ["src/content/content.css"]);
  assert.equal(manifest.background.service_worker, "src/background/service-worker.js");
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.options_page, "src/options/options.html");
});

test("options page loads local ECharts instead of a remote script", () => {
  const html = readFileSync("src/options/options.html", "utf8");

  assert.equal(html.includes("vendor/echarts.min.js"), true);
  assert.equal(/https?:\/\//.test(html), false);
});
```

Create `todo/test/service-worker-import.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

test("service worker module imports without Chrome APIs during syntax checks", async () => {
  globalThis.chrome = {
    runtime: { onMessage: { addListener() {} } },
    alarms: { onAlarm: { addListener() {} } },
    notifications: { onClicked: { addListener() {} } }
  };

  const module = await import(`../src/background/service-worker.js?test=${Date.now()}`);

  assert.equal(typeof module.handleMessage, "function");
  assert.equal(typeof module.handleAlarm, "function");
});
```

- [ ] **Step 2: Run tests to verify they fail before files exist**

Run from `D:\Claire\chrome-plugin\todo`:

```powershell
rtk npm test
```

Expected: `FAIL` because `manifest.json`, `src/options/options.html`, and `src/background/service-worker.js` do not exist yet.

- [ ] **Step 3: Add the minimal extension shell**

Create `todo/package.json`:

```json
{
  "name": "todo-chrome-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "check": "node --check src/background/service-worker.js && node --check src/content/content.js && node --check src/options/options.js && node --check src/shared/messages.js"
  }
}
```

Create `todo/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "todo",
  "description": "A floating todo list with local JSON completed history.",
  "version": "0.1.0",
  "permissions": ["storage", "alarms", "notifications"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/content.js"],
      "css": ["src/content/content.css"],
      "run_at": "document_idle"
    }
  ],
  "options_page": "src/options/options.html",
  "action": {
    "default_title": "todo"
  }
}
```

Create `todo/src/shared/messages.js`:

```js
export const MESSAGE_TYPES = {
  GET_STATE: "TODO_GET_STATE",
  ADD_TODO: "TODO_ADD_TODO",
  UPDATE_TODO_TEXT: "TODO_UPDATE_TODO_TEXT",
  UPDATE_TODO_COLOR: "TODO_UPDATE_TODO_COLOR",
  UPDATE_TODO_REMINDER: "TODO_UPDATE_TODO_REMINDER",
  CLEAR_TODO_REMINDER: "TODO_CLEAR_TODO_REMINDER",
  DELETE_TODO: "TODO_DELETE_TODO",
  REORDER_TODOS: "TODO_REORDER_TODOS",
  COMPLETE_TODO: "TODO_COMPLETE_TODO",
  UPDATE_SETTINGS: "TODO_UPDATE_SETTINGS",
  OPEN_OPTIONS: "TODO_OPEN_OPTIONS",
  GET_COMPLETED_STATUS: "TODO_GET_COMPLETED_STATUS",
  PICK_COMPLETED_FILE: "TODO_PICK_COMPLETED_FILE",
  CREATE_COMPLETED_FILE: "TODO_CREATE_COMPLETED_FILE",
  REQUEST_COMPLETED_FILE_PERMISSION: "TODO_REQUEST_COMPLETED_FILE_PERMISSION",
  READ_COMPLETED_DATA: "TODO_READ_COMPLETED_DATA",
  WRITE_COMPLETED_DATA: "TODO_WRITE_COMPLETED_DATA",
  UPDATE_COMPLETED_RECORD: "TODO_UPDATE_COMPLETED_RECORD",
  DELETE_COMPLETED_RECORD: "TODO_DELETE_COMPLETED_RECORD"
};

export function success(payload = {}) {
  return { ok: true, ...payload };
}

export function failure(reason, message, extra = {}) {
  return { ok: false, reason, message, ...extra };
}
```

Create `todo/src/background/service-worker.js`:

```js
import { failure } from "../shared/messages.js";

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((error) => sendResponse(failure("runtime_error", error?.message || "Operation failed")));
    return true;
  });
}

if (globalThis.chrome?.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    handleAlarm(alarm).catch(() => {});
  });
}

if (globalThis.chrome?.notifications?.onClicked) {
  chrome.notifications.onClicked.addListener(() => {});
}

export async function handleMessage() {
  return failure("not_implemented", "todo is not ready yet");
}

export async function handleAlarm() {}
```

Create `todo/src/content/content.js`:

```js
(() => {
  if (document.getElementById("todo-extension-root")) return;

  const root = document.createElement("div");
  root.id = "todo-extension-root";
  root.innerHTML = `<button class="todo-ball" type="button" title="todo" aria-label="todo">0</button>`;
  document.documentElement.appendChild(root);
})();
```

Create `todo/src/content/content.css`:

```css
#todo-extension-root {
  all: initial;
}
```

Create `todo/src/options/options.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>todo</title>
    <link rel="stylesheet" href="options.css" />
  </head>
  <body>
    <main class="todo-options-shell">
      <h1>todo</h1>
      <section id="completedRecords"></section>
      <section id="storageSettings"></section>
      <section id="weeklySummary">
        <div id="weeklyChart"></div>
      </section>
    </main>
    <script src="../../vendor/echarts.min.js"></script>
    <script type="module" src="options.js"></script>
  </body>
</html>
```

Create `todo/src/options/options.css`:

```css
body {
  margin: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f7f7f5;
  color: #1f2933;
}

.todo-options-shell {
  width: min(1180px, calc(100vw - 48px));
  margin: 0 auto;
  padding: 32px 0;
}
```

Create `todo/src/options/options.js`:

```js
const weeklyChart = document.getElementById("weeklyChart");

if (weeklyChart) {
  weeklyChart.textContent = "";
}
```

Create `todo/README.md`:

```md
# todo

`todo` is a Chrome Manifest V3 extension with a floating global todo list and local JSON completed history.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select `D:\Claire\chrome-plugin\todo`.

## Notes

- Unfinished todos are stored in `chrome.storage.local`.
- Completed records are written to a selected or newly created JSON file only when a todo is completed.
- Reminder notifications fire once only when Chrome is running and the alarm is handled on time.
```

Create `todo/vendor/echarts.min.js` as an empty temporary file for this task:

```js
/* Vendored ECharts browser bundle is added in the final verification task. */
```

- [ ] **Step 4: Run tests and syntax check**

Run:

```powershell
rtk npm test
rtk npm run check
```

Expected: both commands pass.

- [ ] **Step 5: Commit**

Run:

```powershell
rtk git add todo
rtk git commit -m "feat: scaffold todo extension"
```

---

### Task 2: Implement Pure Domain Helpers

**Files:**
- Create: `todo/src/shared/domain.js`
- Create: `todo/test/domain.test.mjs`
- Modify: `todo/package.json`

**Interfaces:**
- Consumes: none.
- Produces: `DEFAULT_COLOR_PRESETS`, `createTodoItem(text, options, now)`, `normalizeTodoItems(input)`, `addTodoItem(items, text, settings, now)`, `updateTodoText(items, id, text, now)`, `updateTodoColor(items, id, color, settings, now)`, `setTodoReminder(items, id, reminderAt, now)`, `clearTodoReminder(items, id, now)`, `markTodoReminded(items, id, now)`, `deleteTodoItem(items, id)`, `reorderTodoItems(items, sourceId, targetId, position)`.
- Produces: `createEmptyCompletedData()`, `normalizeCompletedData(input)`, `appendCompletedRecord(data, text, completedAt)`, `updateCompletedRecordText(data, recordIndex, text)`, `deleteCompletedRecord(data, recordIndex)`, `searchCompletedRecords(data, query)`.

- [ ] **Step 1: Write failing domain tests**

Create `todo/test/domain.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  addTodoItem,
  appendCompletedRecord,
  clearTodoReminder,
  createEmptyCompletedData,
  deleteCompletedRecord,
  deleteTodoItem,
  markTodoReminded,
  normalizeCompletedData,
  normalizeTodoItems,
  reorderTodoItems,
  searchCompletedRecords,
  setTodoReminder,
  updateCompletedRecordText,
  updateTodoColor,
  updateTodoText
} from "../src/shared/domain.js";

const settings = {
  colorPresets: ["#ffffff", "#fef3c7", "#dcfce7"],
  defaultColor: "#ffffff"
};

test("todo items are normalized and empty text is removed", () => {
  const items = normalizeTodoItems([
    { id: "a", text: "  keep  ", color: "#badbad", reminderAt: "bad", reminded: "no" },
    { id: "b", text: "   " }
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].id, "a");
  assert.equal(items[0].text, "keep");
  assert.equal(items[0].color, "#badbad");
  assert.equal(items[0].reminderAt, "");
  assert.equal(items[0].reminded, false);
});

test("todo mutations add, edit, color, reminder, remind, clear, delete, and reorder", () => {
  const first = addTodoItem([], "First", settings, "2026-07-23T08:00:00.000Z");
  const second = addTodoItem(first, "Second", settings, "2026-07-23T08:01:00.000Z");
  const firstId = second[0].id;
  const secondId = second[1].id;

  const renamed = updateTodoText(second, firstId, "First updated", "2026-07-23T08:02:00.000Z");
  assert.equal(renamed[0].text, "First updated");

  const colored = updateTodoColor(renamed, firstId, "#dcfce7", settings, "2026-07-23T08:03:00.000Z");
  assert.equal(colored[0].color, "#dcfce7");

  const invalidColor = updateTodoColor(colored, firstId, "#000000", settings, "2026-07-23T08:04:00.000Z");
  assert.equal(invalidColor[0].color, "#dcfce7");

  const reminded = setTodoReminder(colored, firstId, "2026-07-23T09:00:00.000Z", "2026-07-23T08:05:00.000Z");
  assert.equal(reminded[0].reminderAt, "2026-07-23T09:00:00.000Z");
  assert.equal(reminded[0].reminded, false);

  const marked = markTodoReminded(reminded, firstId, "2026-07-23T09:00:10.000Z");
  assert.equal(marked[0].reminded, true);

  const cleared = clearTodoReminder(marked, firstId, "2026-07-23T09:01:00.000Z");
  assert.equal(cleared[0].reminderAt, "");
  assert.equal(cleared[0].reminded, false);

  const reordered = reorderTodoItems(cleared, firstId, secondId, "after");
  assert.deepEqual(reordered.map((item) => item.id), [secondId, firstId]);

  const deleted = deleteTodoItem(reordered, secondId);
  assert.deepEqual(deleted.map((item) => item.id), [firstId]);
});

test("completed data stores only text and completedAt records", () => {
  const empty = createEmptyCompletedData();
  const data = appendCompletedRecord(empty, "Task A", "2026-07-23T09:30:00.000Z");

  assert.deepEqual(data, {
    version: 1,
    completed: [{ text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" }]
  });

  const normalized = normalizeCompletedData({
    version: "bad",
    completed: [
      { text: " Task B ", completedAt: "2026-07-24T10:00:00.000Z", color: "#fff" },
      { text: "", completedAt: "2026-07-24T11:00:00.000Z" }
    ]
  });
  assert.deepEqual(normalized, {
    version: 1,
    completed: [{ text: "Task B", completedAt: "2026-07-24T10:00:00.000Z" }]
  });
});

test("completed records are edited, deleted, and searched by text", () => {
  const data = {
    version: 1,
    completed: [
      { text: "Write spec", completedAt: "2026-07-23T09:00:00.000Z" },
      { text: "Review plan", completedAt: "2026-07-23T10:00:00.000Z" }
    ]
  };

  const edited = updateCompletedRecordText(data, 1, "Review implementation plan");
  assert.equal(edited.completed[1].text, "Review implementation plan");

  const results = searchCompletedRecords(edited, "implementation");
  assert.equal(results.length, 1);
  assert.equal(results[0].recordIndex, 1);

  const deleted = deleteCompletedRecord(edited, 0);
  assert.deepEqual(deleted.completed, [
    { text: "Review implementation plan", completedAt: "2026-07-23T10:00:00.000Z" }
  ]);
});
```

- [ ] **Step 2: Run tests to verify the helper module is missing**

Run:

```powershell
rtk npm test -- test/domain.test.mjs
```

Expected: `FAIL` because `src/shared/domain.js` has not been created.

- [ ] **Step 3: Implement the pure domain module**

Create `todo/src/shared/domain.js` with the functions named in the interfaces block. Required behavior:

```js
export const DEFAULT_COLOR_PRESETS = ["#ffffff", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#ede9fe"];

export function createEmptyCompletedData() {
  return { version: 1, completed: [] };
}

export function normalizeCompletedData(input) {
  const source = input && typeof input === "object" ? input : {};
  const completed = Array.isArray(source.completed) ? source.completed : [];
  return {
    version: 1,
    completed: completed
      .map((record) => ({
        text: String(record?.text || "").trim(),
        completedAt: normalizeIsoDate(record?.completedAt)
      }))
      .filter((record) => record.text && record.completedAt)
  };
}

export function appendCompletedRecord(data, text, completedAt = new Date().toISOString()) {
  const source = normalizeCompletedData(data);
  const record = {
    text: String(text || "").trim(),
    completedAt: normalizeIsoDate(completedAt)
  };
  if (!record.text || !record.completedAt) return source;
  return { ...source, completed: [...source.completed, record] };
}
```

Also implement the todo mutations with immutable arrays, string-trimmed text, ISO date validation through `new Date(value)`, and `recordIndex` based completed-record edits. `updateTodoColor` must ignore colors that are not present in `settings.colorPresets`. `setTodoReminder` must set `reminded: false`; `clearTodoReminder` must clear `reminderAt` and set `reminded: false`.

- [ ] **Step 4: Add `domain.js` to the syntax check script**

Modify `todo/package.json` so the `check` script includes:

```text
node --check src/shared/domain.js
```

- [ ] **Step 5: Run tests and syntax check**

Run:

```powershell
rtk npm test -- test/domain.test.mjs
rtk npm run check
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

Run:

```powershell
rtk git add todo/src/shared/domain.js todo/test/domain.test.mjs todo/package.json
rtk git commit -m "feat: add todo domain helpers"
```

---

### Task 3: Add Settings And Local Storage Adapters

**Files:**
- Create: `todo/src/shared/settings.js`
- Create: `todo/src/shared/storage.js`
- Create: `todo/test/settings-storage.test.mjs`
- Modify: `todo/package.json`

**Interfaces:**
- Consumes: `DEFAULT_COLOR_PRESETS`, `normalizeTodoItems` from `src/shared/domain.js`.
- Produces: `DEFAULT_SETTINGS`, `sanitizeSettings(input)`, `loadSettings()`, `saveSettings(patch)`.
- Produces: `loadTodoItems()`, `saveTodoItems(items)`, `loadTodoState()`, `saveTodoStatePatch(patch)`.

- [ ] **Step 1: Write failing settings and storage tests**

Create `todo/test/settings-storage.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

test("settings sanitizes ball position and color presets", async () => {
  const { sanitizeSettings } = await import(`../src/shared/settings.js?test=${Date.now()}-sanitize`);
  const settings = sanitizeSettings({
    ballPosition: { left: 40, top: 50, snapped: true, side: "left" },
    colorPresets: ["#ffffff", "bad", "#dcfce7"],
    defaultColor: "#dcfce7"
  });

  assert.deepEqual(settings.ballPosition, { left: 40, top: 50, snapped: true, side: "left" });
  assert.deepEqual(settings.colorPresets, ["#ffffff", "#dcfce7"]);
  assert.equal(settings.defaultColor, "#dcfce7");
});

test("storage reads and writes normalized todo state through chrome.storage.local", async () => {
  const stub = createChromeStorage();
  globalThis.chrome = stub.chrome;
  const storage = await import(`../src/shared/storage.js?test=${Date.now()}-storage`);

  await storage.saveTodoItems([{ id: "a", text: " First ", color: "#fff" }]);
  const items = await storage.loadTodoItems();

  assert.equal(items.length, 1);
  assert.equal(items[0].text, "First");
  assert.deepEqual(Object.keys(stub.values).sort(), ["todoUnfinishedItems"].sort());

  const state = await storage.loadTodoState();
  assert.equal(Array.isArray(state.items), true);
  assert.equal(Array.isArray(state.settings.colorPresets), true);
});

function createChromeStorage(initial = {}) {
  const values = { ...initial };
  return {
    values,
    chrome: {
      storage: {
        local: {
          get(key, callback) {
            if (Array.isArray(key)) {
              callback(Object.fromEntries(key.map((name) => [name, values[name]])));
              return;
            }
            callback({ [key]: values[key] });
          },
          set(value, callback) {
            Object.assign(values, value);
            callback?.();
          }
        }
      }
    }
  };
}
```

- [ ] **Step 2: Run the tests to verify missing modules**

Run:

```powershell
rtk npm test -- test/settings-storage.test.mjs
```

Expected: `FAIL` because `settings.js` and `storage.js` are missing.

- [ ] **Step 3: Implement settings sanitization and storage wrappers**

Create `todo/src/shared/settings.js`:

```js
import { DEFAULT_COLOR_PRESETS } from "./domain.js";

export const DEFAULT_SETTINGS = {
  ballPosition: null,
  colorPresets: DEFAULT_COLOR_PRESETS,
  defaultColor: "#ffffff"
};

export function sanitizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const colorPresets = sanitizeColorPresets(source.colorPresets);
  const defaultColor = colorPresets.includes(source.defaultColor) ? source.defaultColor : colorPresets[0];
  return {
    ballPosition: sanitizeBallPosition(source.ballPosition),
    colorPresets,
    defaultColor
  };
}

export function sanitizeColorPresets(value) {
  const colors = Array.isArray(value) ? value.filter(isHexColor) : DEFAULT_COLOR_PRESETS;
  return colors.length ? [...new Set(colors)] : DEFAULT_COLOR_PRESETS;
}

function sanitizeBallPosition(value) {
  if (!value || typeof value !== "object") return null;
  const left = Number(value.left);
  const top = Number(value.top);
  const side = value.side === "left" || value.side === "right" ? value.side : null;
  return {
    left: Number.isFinite(left) ? Math.max(0, left) : 0,
    top: Number.isFinite(top) ? Math.max(0, top) : 0,
    snapped: value.snapped === true,
    side
  };
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
```

Create `todo/src/shared/storage.js` with promise wrappers around `chrome.storage.local.get/set`, using keys `todoUnfinishedItems` and `todoSettings`. `loadTodoState()` must return `{ items, settings }` with normalized items and sanitized settings.

- [ ] **Step 4: Add storage files to syntax check**

Modify `todo/package.json` so the `check` script includes:

```text
node --check src/shared/settings.js && node --check src/shared/storage.js
```

- [ ] **Step 5: Run tests and syntax check**

Run:

```powershell
rtk npm test -- test/settings-storage.test.mjs
rtk npm run check
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

Run:

```powershell
rtk git add todo/src/shared/settings.js todo/src/shared/storage.js todo/test/settings-storage.test.mjs todo/package.json
rtk git commit -m "feat: add todo local storage"
```

---

### Task 4: Implement Completed JSON Store

**Files:**
- Create: `todo/src/shared/completed-file-store.js`
- Create: `todo/src/shared/data-location.js`
- Create: `todo/test/completed-file-store.test.mjs`
- Create: `todo/test/data-location.test.mjs`
- Modify: `todo/package.json`

**Interfaces:**
- Consumes: `createEmptyCompletedData`, `normalizeCompletedData`, `appendCompletedRecord`, `updateCompletedRecordText`, `deleteCompletedRecord` from `src/shared/domain.js`.
- Produces from `completed-file-store.js`: `getCompletedFileStatus()`, `pickCompletedJsonFile(options)`, `createCompletedJsonFile(options)`, `requestCompletedFilePermission(mode)`, `readCompletedData()`, `writeCompletedData(data)`, `appendCompletedRecordToFile(text, completedAt)`.
- Produces from `data-location.js`: `getCompletedStatus()`, `readCompletedData()`, `writeCompletedData(data)`, `appendCompletedRecord(record)`, `updateCompletedRecord(recordIndex, text)`, `deleteCompletedRecordAt(recordIndex)`, plus remote adapter stubs returning `failure("unsupported_remote", ...)`.

- [ ] **Step 1: Write failing JSON file store tests**

Create `todo/test/completed-file-store.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

test("completed file store creates and writes minimal completed JSON", async () => {
  const writes = [];
  globalThis.indexedDB = createIndexedDbStub();
  globalThis.showSaveFilePicker = async () => createHandle("completed.json", "", writes);
  globalThis.chrome = createChromeStorage().chrome;

  const store = await import(`../src/shared/completed-file-store.js?test=${Date.now()}-create`);
  const createResult = await store.createCompletedJsonFile({ fileName: "todo-completed.json" });

  assert.equal(createResult.ok, true);
  assert.deepEqual(JSON.parse(writes.at(-1)), { version: 1, completed: [] });

  const appendResult = await store.appendCompletedRecordToFile("Task A", "2026-07-23T09:30:00.000Z");
  assert.equal(appendResult.ok, true);
  assert.deepEqual(JSON.parse(writes.at(-1)), {
    version: 1,
    completed: [{ text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" }]
  });
});

test("completed file store reports parse errors without overwriting bad JSON", async () => {
  const writes = [];
  globalThis.indexedDB = createIndexedDbStub();
  globalThis.showOpenFilePicker = async () => [createHandle("bad.json", "{bad", writes)];
  globalThis.chrome = createChromeStorage().chrome;

  const store = await import(`../src/shared/completed-file-store.js?test=${Date.now()}-bad`);
  const result = await store.pickCompletedJsonFile();

  assert.equal(result.ok, false);
  assert.equal(result.reason, "parse_error");
  assert.equal(writes.length, 0);
});

function createHandle(name, initialText, writes) {
  let text = initialText;
  return {
    name,
    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },
    async getFile() {
      return { async text() { return text; } };
    },
    async createWritable() {
      return {
        async write(nextText) {
          text = nextText;
          writes.push(nextText);
        },
        async close() {}
      };
    }
  };
}
```

Append the IndexedDB and chrome storage stubs from `group/test/data-store.test.js`, renamed only where needed for this store.

Create `todo/test/data-location.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

test("data location exposes unsupported remote boundary without using it", async () => {
  globalThis.chrome = createChromeStorage({ todoCompletedDataLocation: { mode: "remote" } }).chrome;
  const store = await import(`../src/shared/data-location.js?test=${Date.now()}-remote`);

  const result = await store.readCompletedData();

  assert.equal(result.ok, false);
  assert.equal(result.reason, "unsupported_remote");
});
```

- [ ] **Step 2: Run tests to verify missing modules**

Run:

```powershell
rtk npm test -- test/completed-file-store.test.mjs test/data-location.test.mjs
```

Expected: `FAIL` because the store modules do not exist.

- [ ] **Step 3: Implement the completed JSON store**

Use the same IndexedDB file handle pattern as `group/src/shared/file-store.js`, with todo-specific constants:

```js
const DB_NAME = "todo-extension";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const COMPLETED_HANDLE_KEY = "completed-json";
const COMPLETED_META_KEY = "todoCompletedFileMeta";
```

Write files as:

```js
`${JSON.stringify(normalizeCompletedData(data), null, 2)}\n`
```

Return failures with stable reasons:

```js
failure("missing_file", "No completed JSON file is bound")
failure("permission_denied", "Completed JSON file permission is required")
failure("parse_error", "Completed JSON is invalid")
failure("write_error", "Completed JSON write failed")
```

`data-location.js` must call local JSON functions when mode is `localFile` or unset. Remote mode must not perform network calls in MVP and must return `unsupported_remote`.

- [ ] **Step 4: Add store files to syntax check**

Modify `todo/package.json` so the `check` script includes:

```text
node --check src/shared/completed-file-store.js && node --check src/shared/data-location.js
```

- [ ] **Step 5: Run tests and syntax check**

Run:

```powershell
rtk npm test -- test/completed-file-store.test.mjs test/data-location.test.mjs
rtk npm run check
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

Run:

```powershell
rtk git add todo/src/shared/completed-file-store.js todo/src/shared/data-location.js todo/test/completed-file-store.test.mjs todo/test/data-location.test.mjs todo/package.json
rtk git commit -m "feat: add todo completed file store"
```

---

### Task 5: Implement Reminder Scheduling And Background Message Handling

**Files:**
- Create: `todo/src/shared/reminder-schedule.js`
- Create: `todo/test/reminder-schedule.test.mjs`
- Create: `todo/test/service-worker.test.mjs`
- Modify: `todo/src/background/service-worker.js`
- Modify: `todo/package.json`

**Interfaces:**
- Consumes: message constants, domain helpers, storage helpers, data-location helpers.
- Produces: `alarmNameForTodo(id)`, `todoIdFromAlarmName(name)`, `isReminderOnTime(reminderAt, handledAt, graceMs = 120000)`.
- Produces: `handleMessage(message, sender)` and `handleAlarm(alarm, handledAt)` in `service-worker.js`.

- [ ] **Step 1: Write failing reminder tests**

Create `todo/test/reminder-schedule.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { alarmNameForTodo, isReminderOnTime, todoIdFromAlarmName } from "../src/shared/reminder-schedule.js";

test("alarm names encode and decode todo ids", () => {
  assert.equal(alarmNameForTodo("abc"), "todo-reminder:abc");
  assert.equal(todoIdFromAlarmName("todo-reminder:abc"), "abc");
  assert.equal(todoIdFromAlarmName("other"), "");
});

test("reminder on-time check allows two minutes and rejects late backfill", () => {
  assert.equal(isReminderOnTime("2026-07-23T09:00:00.000Z", "2026-07-23T09:01:59.000Z"), true);
  assert.equal(isReminderOnTime("2026-07-23T09:00:00.000Z", "2026-07-23T09:02:01.000Z"), false);
});
```

Create `todo/test/service-worker.test.mjs` with Chrome stubs:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { MESSAGE_TYPES } from "../src/shared/messages.js";

test("complete message appends completed JSON and removes unfinished todo", async () => {
  const chromeStub = createChromeStub();
  globalThis.chrome = chromeStub.chrome;
  const worker = await import(`../src/background/service-worker.js?test=${Date.now()}-complete`);

  chromeStub.values.todoUnfinishedItems = [{ id: "a", text: "Task A", color: "#fff" }];
  worker.__setCompletedStoreForTest({
    async appendCompletedRecord(record) {
      chromeStub.appended = record;
      return { ok: true, data: { version: 1, completed: [record] } };
    }
  });

  const result = await worker.handleMessage({
    type: MESSAGE_TYPES.COMPLETE_TODO,
    payload: { id: "a", completedAt: "2026-07-23T09:30:00.000Z" }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(chromeStub.appended, { text: "Task A", completedAt: "2026-07-23T09:30:00.000Z" });
  assert.deepEqual(chromeStub.values.todoUnfinishedItems, []);
});
```

- [ ] **Step 2: Run tests to verify missing behavior**

Run:

```powershell
rtk npm test -- test/reminder-schedule.test.mjs test/service-worker.test.mjs
```

Expected: `FAIL` until reminder helpers and worker message routing are implemented.

- [ ] **Step 3: Implement reminder helpers**

Create `todo/src/shared/reminder-schedule.js`:

```js
const ALARM_PREFIX = "todo-reminder:";

export function alarmNameForTodo(id) {
  return `${ALARM_PREFIX}${String(id || "")}`;
}

export function todoIdFromAlarmName(name) {
  const text = String(name || "");
  return text.startsWith(ALARM_PREFIX) ? text.slice(ALARM_PREFIX.length) : "";
}

export function isReminderOnTime(reminderAt, handledAt = new Date().toISOString(), graceMs = 120000) {
  const reminderTime = Date.parse(reminderAt);
  const handledTime = Date.parse(handledAt);
  return Number.isFinite(reminderTime) && Number.isFinite(handledTime) && handledTime - reminderTime <= graceMs;
}
```

- [ ] **Step 4: Implement background message handling**

Update `todo/src/background/service-worker.js` to handle:

- `GET_STATE`: return unfinished items, settings, and completed file status.
- `ADD_TODO`: add a todo and save to local storage.
- `UPDATE_TODO_TEXT`, `UPDATE_TODO_COLOR`, `UPDATE_TODO_REMINDER`, `CLEAR_TODO_REMINDER`, `DELETE_TODO`, `REORDER_TODOS`: mutate local unfinished state.
- `COMPLETE_TODO`: append `{ text, completedAt }` to completed JSON first; remove unfinished todo only after append succeeds.
- `OPEN_OPTIONS`: call `chrome.runtime.openOptionsPage()`.
- management messages for completed file binding, permission, reading, writing, editing, and deleting.

Add this exported test hook:

```js
export function __setCompletedStoreForTest(store) {
  completedStoreOverride = store;
}
```

The production path must import and use `../shared/data-location.js` when no override exists.

When setting reminders:

```js
await chrome.alarms.create(alarmNameForTodo(id), { when: Date.parse(reminderAt) });
```

When clearing, deleting, or completing a todo:

```js
await chrome.alarms.clear(alarmNameForTodo(id));
```

`handleAlarm` must mark late reminders as `reminded: true` without creating a notification.

- [ ] **Step 5: Add worker files to syntax check**

Modify `todo/package.json` so the `check` script includes:

```text
node --check src/shared/reminder-schedule.js
```

- [ ] **Step 6: Run tests and syntax check**

Run:

```powershell
rtk npm test -- test/reminder-schedule.test.mjs test/service-worker.test.mjs test/service-worker-import.test.mjs
rtk npm run check
```

Expected: all commands pass.

- [ ] **Step 7: Commit**

Run:

```powershell
rtk git add todo/src/shared/reminder-schedule.js todo/src/background/service-worker.js todo/test/reminder-schedule.test.mjs todo/test/service-worker.test.mjs todo/package.json
rtk git commit -m "feat: add todo background behavior"
```

---

### Task 6: Build The Floating Ball And Todo Panel

**Files:**
- Modify: `todo/src/content/content.js`
- Modify: `todo/src/content/content.css`
- Create: `todo/test/content-panel.test.mjs`
- Create: `todo/test/content-css.test.mjs`

**Interfaces:**
- Consumes: `MESSAGE_TYPES` through a local constant copy or generated import-free constants because content scripts are not module scripts in this manifest.
- Consumes: background `GET_STATE`, todo mutation, complete, delete, reorder, reminder, settings, and open-options messages.
- Produces: injected UI root `#todo-extension-root`, `.todo-ball`, `.todo-panel`, `.todo-item`, `.todo-action-color`, `.todo-action-reminder`, `.todo-action-complete`, `.todo-action-delete`.

- [ ] **Step 1: Write failing content tests**

Create `todo/test/content-panel.test.mjs` using the VM-and-stub pattern from `group/test/content-panel.test.js`. Cover these cases:

```js
test("content ball displays unfinished count and toggles the panel", async () => {
  const { context, document } = createContentContext({
    items: [{ id: "a", text: "Task A" }, { id: "b", text: "Task B" }]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  assert.equal(document.elements[".todo-ball"].textContent, "2");
  document.elements[".todo-ball"].dispatch("click", {});
  await delay(0);
  assert.equal(document.elements[".todo-panel"].hidden, false);
});

test("complete keeps the item when JSON is not bound", async () => {
  const completeMessages = [];
  const { context, document } = createContentContext({
    items: [{ id: "a", text: "Task A" }],
    completeResponse: { ok: false, reason: "missing_file", message: "No completed JSON file is bound" },
    onComplete(message) {
      completeMessages.push(message);
    }
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);
  document.elements[".todo-ball"].dispatch("click", {});
  await delay(0);

  const completeButton = createActionTarget("todo-action-complete", { todoId: "a" }, document.elements[".todo-list"]);
  document.elements[".todo-list"].dispatch("click", { target: completeButton });
  await delay(0);

  assert.equal(completeMessages.length, 1);
  assert.match(document.elements[".todo-list"].innerHTML, /Task A/);
  assert.match(document.elements[".todo-toast"].textContent, /JSON/);
});
```

Create `todo/test/content-css.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("content CSS scopes styles and fixes panel dimensions", () => {
  const css = readFileSync("src/content/content.css", "utf8");

  assert.match(css, /#todo-extension-root/);
  assert.match(css, /\.todo-panel[\s\S]*width:\s*420px/);
  assert.match(css, /\.todo-panel[\s\S]*height:\s*560px/);
  assert.equal(css.includes("body {"), false);
});
```

- [ ] **Step 2: Run tests to verify missing panel behavior**

Run:

```powershell
rtk npm test -- test/content-panel.test.mjs test/content-css.test.mjs
```

Expected: `FAIL` until content UI is implemented.

- [ ] **Step 3: Implement content UI**

Update `todo/src/content/content.js` to:

- inject only once,
- render the ball and panel,
- load state with `TODO_GET_STATE`,
- update the count,
- add todos from the top input on Enter,
- edit text with `blur` and Enter,
- open color palette from current presets,
- set/clear reminders through a datetime-local popover,
- complete and delete through delegated clicks,
- implement drag sorting in the list,
- persist list order on panel close with `TODO_REORDER_TODOS`,
- implement ball dragging with free-form coordinates and edge snap threshold of 24 px.

Use a root HTML shape compatible with tests:

```html
<div class="todo-shell">
  <button class="todo-ball" type="button" title="todo" aria-label="todo"></button>
  <section class="todo-panel" hidden>
    <form class="todo-create-form">
      <input class="todo-create-input" autocomplete="off" />
    </form>
    <div class="todo-list"></div>
  </section>
  <div class="todo-toast" hidden></div>
</div>
```

Use `textContent` for user todo text and `escapeHtml` only when building string templates. Do not use host page classes or global selectors outside `#todo-extension-root`.

- [ ] **Step 4: Implement content styling**

Update `todo/src/content/content.css` with namespaced styles:

- fixed root with very high z-index,
- `.todo-ball` circular button with count centered,
- `.todo-panel` set to `width: 420px; height: 560px;`,
- list rows with wrapping text,
- icon buttons for color, reminder, complete, and delete,
- `.todo-action-complete` text content rendered as `✔️`,
- `.todo-action-delete` text content rendered as `❌`,
- drag-over state and toast state.

- [ ] **Step 5: Run content tests and syntax check**

Run:

```powershell
rtk npm test -- test/content-panel.test.mjs test/content-css.test.mjs
rtk npm run check
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

Run:

```powershell
rtk git add todo/src/content/content.js todo/src/content/content.css todo/test/content-panel.test.mjs todo/test/content-css.test.mjs
rtk git commit -m "feat: add todo floating panel"
```

---

### Task 7: Build The Management Page And Weekly Summary

**Files:**
- Create: `todo/src/shared/weekly-summary.js`
- Create: `todo/test/weekly-summary.test.mjs`
- Create: `todo/test/options-ui.test.mjs`
- Modify: `todo/src/options/options.html`
- Modify: `todo/src/options/options.css`
- Modify: `todo/src/options/options.js`
- Modify: `todo/package.json`

**Interfaces:**
- Consumes: completed data adapter messages handled by the background worker.
- Consumes: settings update messages.
- Produces from `weekly-summary.js`: `getWeekRange(anchorDate)`, `buildWeeklySummary(records, anchorDate)`, `buildEChartsHeatmapOption(summary)`.
- Produces options UI controls with ids: `completedSearch`, `completedList`, `pickCompletedFile`, `createCompletedFile`, `requestCompletedPermission`, `colorPresetList`, `addColorPreset`, `weeklyChart`.

- [ ] **Step 1: Write failing weekly summary tests**

Create `todo/test/weekly-summary.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklySummary, getWeekRange } from "../src/shared/weekly-summary.js";

test("week range starts Monday and ends Sunday in local time", () => {
  const range = getWeekRange(new Date("2026-07-23T12:00:00"));

  assert.equal(range.start.getDay(), 1);
  assert.equal(range.end.getDay(), 0);
});

test("weekly summary uses only occupied hours and adds weekend columns only when needed", () => {
  const summary = buildWeeklySummary(
    [
      { text: "Monday task", completedAt: "2026-07-20T09:30:00.000Z" },
      { text: "Friday task", completedAt: "2026-07-24T14:00:00.000Z" },
      { text: "Saturday task", completedAt: "2026-07-25T21:00:00.000Z" }
    ],
    new Date("2026-07-23T12:00:00")
  );

  assert.deepEqual(summary.hours, ["09:00", "14:00", "21:00"]);
  assert.deepEqual(summary.days.map((day) => day.key), ["mon", "tue", "wed", "thu", "fri", "sat"]);
  assert.equal(summary.cells["09:00|mon"].tasks[0], "Monday task");
  assert.equal(summary.cells["21:00|sat"].tasks[0], "Saturday task");
});
```

Create `todo/test/options-ui.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
```

- [ ] **Step 2: Run tests to verify missing management behavior**

Run:

```powershell
rtk npm test -- test/weekly-summary.test.mjs test/options-ui.test.mjs
```

Expected: `FAIL` until weekly summary and options markup are implemented.

- [ ] **Step 3: Implement weekly summary helpers**

Create `todo/src/shared/weekly-summary.js`:

```js
const WEEKDAYS = [
  { key: "mon", label: "周一", jsDay: 1 },
  { key: "tue", label: "周二", jsDay: 2 },
  { key: "wed", label: "周三", jsDay: 3 },
  { key: "thu", label: "周四", jsDay: 4 },
  { key: "fri", label: "周五", jsDay: 5 },
  { key: "sat", label: "周六", jsDay: 6 },
  { key: "sun", label: "周日", jsDay: 0 }
];
```

`buildWeeklySummary(records, anchorDate)` must:

- filter records whose `completedAt` is inside the local Monday to Sunday week,
- derive hour labels as `HH:00`,
- include Monday through Friday by default,
- include Saturday or Sunday only when records exist on those days,
- return `cells` keyed by `${hour}|${dayKey}` with `{ tasks, count }`.

`buildEChartsHeatmapOption(summary)` must return a heatmap option with:

- x-axis labels from `summary.days`,
- y-axis labels from `summary.hours`,
- data points `[dayIndex, hourIndex, count, taskNames]`,
- label formatter joining task names with `\n`,
- visualMap hidden or compact,
- chart height guidance exported as `summary.chartHeight`, computed from the highest task count per cell.

- [ ] **Step 4: Implement options management page**

Update `todo/src/options/options.html` to include:

- file binding controls,
- completed search input,
- completed list container,
- color preset controls,
- weekly chart container.

Update `todo/src/options/options.js` to:

- call background messages instead of direct file writes,
- render completed records sorted by `completedAt` descending,
- keep `recordIndex` from the original JSON array for edit/delete,
- edit text through an inline input,
- delete one completed record with a direct button,
- filter by text only,
- render color preset swatches with add/edit/delete controls,
- update settings via `TODO_UPDATE_SETTINGS`,
- render ECharts when `globalThis.echarts` exists,
- show a small fallback message if `echarts` is unavailable.

Update `todo/src/options/options.css` with a quiet operational layout, not a marketing page:

- full-width shell,
- dense but readable sections,
- plain controls,
- color swatches,
- chart area with minimum height and dynamic height support.

- [ ] **Step 5: Add weekly file to syntax check**

Modify `todo/package.json` so the `check` script includes:

```text
node --check src/shared/weekly-summary.js
```

- [ ] **Step 6: Run tests and syntax check**

Run:

```powershell
rtk npm test -- test/weekly-summary.test.mjs test/options-ui.test.mjs
rtk npm run check
```

Expected: both commands pass.

- [ ] **Step 7: Commit**

Run:

```powershell
rtk git add todo/src/shared/weekly-summary.js todo/src/options/options.html todo/src/options/options.css todo/src/options/options.js todo/test/weekly-summary.test.mjs todo/test/options-ui.test.mjs todo/package.json
rtk git commit -m "feat: add todo management page"
```

---

### Task 8: Vendor ECharts, Add Final Coverage, And Verify Manually

**Files:**
- Modify: `todo/vendor/echarts.min.js`
- Create: `todo/test/integration-contract.test.mjs`
- Modify: `todo/README.md`
- Modify: `todo/package.json` if the final `check` script needs a new source file.

**Interfaces:**
- Consumes: all previous task interfaces.
- Produces: final local ECharts asset and final verification evidence.

- [ ] **Step 1: Write final integration contract tests**

Create `todo/test/integration-contract.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("runtime never loads remote scripts", () => {
  const html = readFileSync("src/options/options.html", "utf8");
  const manifest = readFileSync("manifest.json", "utf8");

  assert.equal(/<script[^>]+https?:\/\//.test(html), false);
  assert.equal(/https?:\/\//.test(manifest), false);
});

test("completed records contain only text and completedAt", () => {
  const data = appendCompletedRecord(createEmptyCompletedData(), "Task A", "2026-07-23T09:30:00.000Z");

  assert.deepEqual(Object.keys(data.completed[0]).sort(), ["completedAt", "text"]);
});

test("vendored ECharts file is present", () => {
  const source = readFileSync("vendor/echarts.min.js", "utf8");

  assert.equal(source.length > 100000, true);
  assert.equal(source.includes("echarts"), true);
});
```

- [ ] **Step 2: Run tests to verify the temporary ECharts file fails**

Run:

```powershell
rtk npm test -- test/integration-contract.test.mjs
```

Expected: `FAIL` because `vendor/echarts.min.js` is still the temporary short file.

- [ ] **Step 3: Vendor the ECharts browser bundle**

Use one of these exact approaches:

Preferred when network works:

```powershell
rtk proxy powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js' -OutFile 'D:\Claire\chrome-plugin\todo\vendor\echarts.min.js'"
```

After copying, inspect the first line:

```powershell
rtk proxy powershell -NoProfile -Command "Get-Content -TotalCount 1 -LiteralPath 'D:\Claire\chrome-plugin\todo\vendor\echarts.min.js'"
```

Expected: a minified JavaScript header or minified source text containing `echarts`.

- [ ] **Step 4: Update README with final manual verification checklist**

Append to `todo/README.md`:

```md
## Manual Verification

1. Load unpacked from this folder.
2. Open an ordinary `http` or `https` page and confirm the todo ball appears.
3. Add two unfinished todos and confirm the ball count updates.
4. Drag the ball freely, then drag near an edge and confirm it snaps.
5. Drag-sort todos, close the panel, reopen it, and confirm the order persists.
6. Edit a todo, change its color, set a reminder, then delete another todo.
7. Bind a new completed JSON file from the options page.
8. Complete a todo and confirm the JSON record contains only `text` and `completedAt`.
9. Confirm an unbound or unauthorized JSON file blocks completion without removing the todo.
10. Confirm a due reminder shows one Chrome notification when Chrome is running.
11. Open the options page and confirm text search, edit, delete, color presets, and weekly summary.
```

- [ ] **Step 5: Run the full verification suite**

Run:

```powershell
rtk npm test
rtk npm run check
```

Expected: all tests and syntax checks pass.

- [ ] **Step 6: Manual Chrome verification**

Follow the README checklist. Record any failed step and fix it before final handoff.

- [ ] **Step 7: Commit**

Run:

```powershell
rtk git add todo
rtk git commit -m "feat: complete todo chrome extension"
```

---

## Self-Review

### Spec Coverage

- Global unfinished todo list: Task 2, Task 3, Task 5, Task 6.
- Floating ball, count, free drag, edge snap: Task 6.
- Panel size, top input, long text wrapping, edit, drag sort, color, reminder, complete, delete: Task 6.
- Unfinished storage in `chrome.storage.local`: Task 3 and Task 5.
- Completed JSON only on `✔️`: Task 2, Task 4, Task 5, Task 8.
- Local JSON existing/new binding: Task 4 and Task 7.
- Missing JSON blocks completion without removing todo: Task 5 and Task 6.
- Management search/edit/delete: Task 7.
- Color presets in management and not completed JSON: Task 3, Task 6, Task 7, Task 8.
- One-shot reminders without late backfill: Task 5.
- Notification clicks do nothing: Task 5.
- Weekly dynamic ECharts summary: Task 7 and Task 8.
- No remote runtime script: Task 1 and Task 8.
- Remote storage adapter boundary only: Task 4.

### Consistency Checks

- Message names in tasks match `MESSAGE_TYPES` from Task 1.
- Completed record mutation uses `recordIndex` from the source JSON array so the JSON schema remains exactly `{ text, completedAt }`.
- Reminder task uses the same two-minute on-time window from the approved spec; early and late alarms do not mark items reminded.
- The content script remains non-module because the manifest uses plain content script loading.
- All commands use `rtk` as required by this repository.

### Execution Notes

- Keep the existing unrelated untracked file `bitbucket-pr-ai-reviewer/local-default-settings.example.js` out of all commits.
- If an implementer chooses inline execution, complete tasks in order; later UI tasks depend on earlier shared interfaces.
- If manual verification reveals layout issues, keep fixes scoped to `todo/src/content/*` or `todo/src/options/*` and rerun the relevant tests.
