import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("content source exposes the instrument launcher and panel summary", () => {
  const source = readFileSync("src/content/content.js", "utf8");

  assert.match(source, /class="todo-ball-count"/);
  assert.doesNotMatch(source, /todo-ball-tick/);
  assert.match(source, /class="todo-panel-header"/);
  assert.match(source, /ball\.setAttribute\("aria-label", `未完成待办 \$\{unfinishedCount\} 项`\)/);
});

test("content source exposes an accessible add button and alert toast", () => {
  const source = readFileSync("src/content/content.js", "utf8");

  assert.match(source, /<button class="todo-create-submit" type="submit" aria-label="添加待办">添加<\/button>/);
  assert.match(source, /<div class="todo-toast" role="alert" aria-live="assertive" aria-atomic="true" hidden><\/div>/);
});

test("content panel positioning uses the screenshot panel width", () => {
  const source = readFileSync("src/content/content.js", "utf8");

  assert.match(source, /const PANEL_WIDTH = 320;/);
});

test("content panel exposes local outline icons and options entries", async () => {
  const source = readFileSync("src/content/content.js", "utf8");

  assert.match(source, /class="todo-header-settings" type="button" aria-label="打开设置"/);
  assert.doesNotMatch(source, /todo-header-manage/);
  assert.match(source, /const TODO_ICONS = Object\.freeze/);
  assert.doesNotMatch(source, /class="todo-task-check"/);
  assert.doesNotMatch(source, /todo-action-(?:color|reminder|complete|delete)[^>]*>[●◷✔️❌]/);

  const { context, document, messages } = createContentContext();
  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".todo-header-settings"].dispatch("click", {});

  assert.equal(messages.filter((message) => message.type === "TODO_OPEN_OPTIONS").length, 1);
});

test("content ball displays unfinished count and toggles the panel", async () => {
  const { context, document } = createContentContext({
    items: [{ id: "a", text: "Task A" }, { id: "b", text: "Task B" }]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  assert.equal(document.elements[".todo-ball-count"].textContent, "2");
  assert.equal(document.elements[".todo-ball"].attributes["aria-label"], "未完成待办 2 项");
  document.elements[".todo-ball"].dispatch("click", {});
  await delay(0);
  assert.equal(document.elements[".todo-panel"].hidden, false);
});

test("todo rows show a visible reminder action and reminder time", async () => {
  const { context, document } = createContentContext({
    items: [{ id: "a", text: "Task A", reminderAt: "2026-07-23T09:05:00.000Z" }]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  const html = document.elements[".todo-list"].innerHTML;
  assert.match(html, /class="todo-action-reminder-label">提醒<\/span>/);
  assert.match(html, /class="todo-reminder-chip"/);
  assert.match(html, /提醒\s+\d{2}\/\d{2}\s+\d{2}:\d{2}/);
});

test("runtime reminder messages stay visible until acknowledged", async () => {
  const { context, document, dispatchRuntimeMessage, timeoutCalls } = createContentContext({ captureTimeouts: true });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  const timeoutCountBeforeReminder = timeoutCalls.length;
  dispatchRuntimeMessage({ type: "TODO_REMINDER_DUE", payload: { text: "Task A" } });
  await delay(0);

  const toast = document.elements[".todo-toast"];
  assert.equal(toast.hidden, false);
  assert.equal(timeoutCalls.length, timeoutCountBeforeReminder);
  assert.match(toast.innerHTML, /提醒：Task A/);
  assert.match(toast.innerHTML, /class="todo-toast-ack" type="button">我知道了<\/button>/);

  const ackButton = createActionTarget("todo-toast-ack", {}, toast);
  toast.dispatch("click", { target: ackButton });

  assert.equal(toast.hidden, true);
});

test("clicking outside the panel closes the open panel", async () => {
  const { context, document } = createContentContext({
    items: [{ id: "a", text: "Task A" }]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".todo-ball"].dispatch("click", {});
  await delay(0);
  assert.equal(document.elements[".todo-panel"].hidden, false);

  document.dispatch("pointerdown", { target: { nodeType: 1 } });
  await delay(0);

  assert.equal(document.elements[".todo-panel"].hidden, true);
});

test("panel opens fully inside an ordinary viewport", async () => {
  const { context, document } = createContentContext({
    items: [{ id: "a", text: "Task A" }]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);
  document.elements[".todo-ball"].dispatch("click", {});
  await delay(0);

  const top = Number.parseInt(document.elements[".todo-panel"].style.top, 10);
  assert.equal(document.elements[".todo-panel"].style.position, "fixed");
  assert.ok(top >= 12);
  assert.ok(top + 560 <= context.window.innerHeight - 12);
});

test("panel fits within a narrow viewport", async () => {
  const { context, document } = createContentContext({ innerWidth: 400 });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);
  document.elements[".todo-ball"].dispatch("click", {});
  await delay(0);

  const left = Number.parseInt(document.elements[".todo-panel"].style.left, 10);
  assert.ok(left >= 12);
  assert.ok(left + 376 <= context.window.innerWidth - 12);
});

test("panel fits within a short viewport", async () => {
  const { context, document } = createContentContext({ innerHeight: 500 });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);
  document.elements[".todo-ball"].dispatch("click", {});
  await delay(0);

  const top = Number.parseInt(document.elements[".todo-panel"].style.top, 10);
  assert.ok(top >= 12);
  assert.ok(top + 476 <= context.window.innerHeight - 12);
});

test("open panel is reclamped after the viewport shrinks", async () => {
  const { context, document } = createContentContext();

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);
  document.elements[".todo-ball"].dispatch("click", {});
  await delay(0);

  context.window.innerWidth = 400;
  context.window.innerHeight = 500;
  context.window.dispatch("resize");

  const left = Number.parseInt(document.elements[".todo-panel"].style.left, 10);
  const top = Number.parseInt(document.elements[".todo-panel"].style.top, 10);
  assert.ok(left >= 12);
  assert.ok(left + 376 <= context.window.innerWidth - 12);
  assert.ok(top >= 12);
  assert.ok(top + 476 <= context.window.innerHeight - 12);
});

test("clicking the ball does not snap it but dragging does", async () => {
  const { context, messages, document } = createContentContext();

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  const ball = document.elements[".todo-ball"];
  ball.dispatch("pointerdown", { clientX: 10, clientY: 10, pointerId: 1 });
  ball.dispatch("pointerup", { clientX: 10, clientY: 10, pointerId: 1 });
  await delay(0);
  assert.equal(document.elements[".todo-shell"].style.left, undefined);
  assert.equal(messages.filter((message) => message.type === "TODO_UPDATE_SETTINGS").length, 0);

  ball.dispatch("pointerdown", { clientX: 10, clientY: 10, pointerId: 2 });
  ball.dispatch("pointermove", { clientX: 20, clientY: 10, pointerId: 2 });
  ball.dispatch("pointerup", { clientX: 20, clientY: 10, pointerId: 2 });
  await delay(0);
  const persisted = messages.find((message) => message.type === "TODO_UPDATE_SETTINGS")?.payload.ballPosition;
  assert.equal(Number.isFinite(persisted?.leftRatio), true);
  assert.equal(Number.isFinite(persisted?.topRatio), true);
  assert.equal("left" in persisted, false);
  assert.equal("top" in persisted, false);
});

test("dragging the ball into the page snaps it to the nearest edge", async () => {
  const { context, messages, document } = createContentContext();

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  const ball = document.elements[".todo-ball"];
  ball.dispatch("pointerdown", { clientX: 10, clientY: 10, pointerId: 3 });
  ball.dispatch("pointermove", { clientX: 700, clientY: 110, pointerId: 3 });
  ball.dispatch("pointerup", { clientX: 700, clientY: 110, pointerId: 3 });
  await delay(0);

  assert.equal(document.elements[".todo-shell"].style.left, "1152px");
  const persisted = messages.find((message) => message.type === "TODO_UPDATE_SETTINGS")?.payload.ballPosition;
  assert.equal(persisted?.leftRatio, 1);
  assert.equal(persisted?.topRatio, 100 / 752);
  assert.equal(persisted?.snapped, true);
  assert.equal(persisted?.side, "right");
});

test("restored ratio ball positions are reapplied after the viewport changes", async () => {
  const { context, document, messages } = createContentContext({
    settings: { ballPosition: { leftRatio: 0.5, topRatio: 0.25, snapped: false, side: null } }
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  assert.equal(document.elements[".todo-shell"].style.left, "1152px");
  assert.equal(document.elements[".todo-shell"].style.top, "188px");

  context.window.innerWidth = 600;
  context.window.innerHeight = 400;
  context.window.dispatch("resize");

  assert.equal(document.elements[".todo-shell"].style.left, "552px");
  assert.equal(document.elements[".todo-shell"].style.top, "88px");
  const corrected = messages.find((message) => message.type === "TODO_UPDATE_SETTINGS")?.payload.ballPosition;
  assert.equal(corrected?.leftRatio, 1);
  assert.equal(corrected?.topRatio, 0.25);
  assert.equal(corrected?.snapped, true);
  assert.equal(corrected?.side, "right");
});

test("legacy pixel ball positions are clamped and migrated to ratios", async () => {
  const { context, document, messages } = createContentContext({
    settings: { ballPosition: { left: 5000, top: 5000, snapped: false, side: null } }
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  assert.equal(document.elements[".todo-shell"].style.left, "1152px");
  assert.equal(document.elements[".todo-shell"].style.top, "752px");
  const corrected = messages.find((message) => message.type === "TODO_UPDATE_SETTINGS")?.payload.ballPosition;
  assert.equal(corrected?.leftRatio, 1);
  assert.equal(corrected?.topRatio, 1);
  assert.equal("left" in corrected, false);
  assert.equal("top" in corrected, false);
  assert.equal(corrected?.snapped, true);
  assert.equal(corrected?.side, "right");
});

test("storage changes refresh the unfinished count on an injected page", async () => {
  const { context, document, setBackgroundItems, dispatchStorageChange } = createContentContext({
    items: [{ id: "a", text: "Task A" }]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);
  setBackgroundItems([{ id: "a", text: "Task A" }, { id: "b", text: "Task B" }]);
  dispatchStorageChange({ todoUnfinishedItems: { newValue: [] } });
  await delay(0);

  assert.equal(document.elements[".todo-ball-count"].textContent, "2");
});

test("closing the panel persists a local reorder", async () => {
  const { context, messages, document } = createContentContext({
    items: [{ id: "a", text: "Task A" }, { id: "b", text: "Task B" }]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);
  document.elements[".todo-ball"].dispatch("click", {});
  await delay(0);

  const source = createTodoTarget("b", document.elements[".todo-list"]);
  const target = createTodoTarget("a", document.elements[".todo-list"]);
  document.elements[".todo-list"].dispatch("dragstart", { target: source, dataTransfer: { setData() {} } });
  document.elements[".todo-list"].dispatch("drop", { target, clientY: 0, preventDefault() {} });
  document.elements[".todo-ball"].dispatch("click", {});
  await delay(0);

  const reorder = messages.find((message) => message.type === "TODO_REORDER_TODOS");
  assert.equal(reorder?.payload.sourceId, "b");
  assert.equal(reorder?.payload.targetId, "a");
  assert.equal(reorder?.payload.position, "before");
  assert.ok(document.elements[".todo-list"].innerHTML.indexOf("Task B") < document.elements[".todo-list"].innerHTML.indexOf("Task A"));
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

test("error toast is clamped into the viewport when the ball is near the lower-left edge", async () => {
  const { context, document } = createContentContext({
    innerWidth: 320,
    innerHeight: 220,
    rects: {
      ".todo-shell": { left: 0, top: 180, width: 48, height: 48, right: 48, bottom: 228 },
      ".todo-toast": { left: 0, top: 0, width: 300, height: 44, right: 300, bottom: 44 }
    },
    items: [{ id: "a", text: "Task A" }],
    completeResponse: { ok: false, reason: "missing_file", message: "No completed JSON file is bound" }
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

  const toast = document.elements[".todo-toast"];
  const left = Number.parseInt(toast.style.left, 10);
  const top = Number.parseInt(toast.style.top, 10);
  assert.equal(toast.style.position, "fixed");
  assert.ok(left >= 12);
  assert.ok(left + 296 <= context.window.innerWidth - 12);
  assert.ok(top >= 12);
  assert.ok(top + 44 <= context.window.innerHeight - 12);
});

function createContentContext(options = {}) {
  const document = createDocumentStub(options);
  let backgroundItems = options.items || [];
  const messages = [];
  const timeoutCalls = [];
  let storageChangeListener;
  let runtimeMessageListener;
  const scheduleTimeout = (callback, delayMs) => {
    if (!options.captureTimeouts) return setTimeout(callback, delayMs);
    timeoutCalls.push({ callback, delayMs });
    return timeoutCalls.length;
  };
  const cancelTimeout = (timer) => {
    if (!options.captureTimeouts) clearTimeout(timer);
  };
  const context = {
    chrome: {
      runtime: {
        lastError: null,
        onMessage: {
          addListener(listener) {
            runtimeMessageListener = listener;
          }
        },
        sendMessage(message, callback) {
          messages.push(message);
          if (message.type === "TODO_GET_STATE") {
            callback({ ok: true, items: [...backgroundItems], settings: options.settings || { colorPresets: ["#ffffff"] } });
            return;
          }
          if (message.type === "TODO_COMPLETE_TODO") {
            options.onComplete?.(message);
            callback(options.completeResponse || { ok: true, items: backgroundItems.filter((item) => item.id !== message.payload.id) });
            return;
          }
          if (message.type === "TODO_REORDER_TODOS") {
            const sourceIndex = backgroundItems.findIndex((item) => item.id === message.payload.sourceId);
            const [moved] = backgroundItems.splice(sourceIndex, 1);
            const targetIndex = backgroundItems.findIndex((item) => item.id === message.payload.targetId);
            backgroundItems.splice(targetIndex + (message.payload.position === "after" ? 1 : 0), 0, moved);
            callback({ ok: true, items: [...backgroundItems] });
            return;
          }
          callback({ ok: true, items: [...backgroundItems] });
        }
      },
      storage: {
        onChanged: {
          addListener(listener) {
            storageChangeListener = listener;
          }
        }
      }
    },
    document,
    location: { href: "https://example.com/page" },
    window: {
      innerWidth: options.innerWidth || 1200,
      innerHeight: options.innerHeight || 800,
      listeners: {},
      addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
      dispatch(type, event = {}) { for (const listener of this.listeners[type] || []) listener(event); },
      setTimeout: scheduleTimeout,
      clearTimeout: cancelTimeout
    },
    setTimeout: scheduleTimeout,
    clearTimeout: cancelTimeout,
    console,
    Promise,
    String,
    Array,
    Boolean,
    Math,
    Object,
    Error,
    RegExp,
    Date
  };
  context.globalThis = context;
  return {
    context,
    document,
    messages,
    timeoutCalls,
    setBackgroundItems(items) { backgroundItems = items; },
    dispatchRuntimeMessage(message) { runtimeMessageListener?.(message, {}, () => {}); },
    dispatchStorageChange(changes) { storageChangeListener?.(changes, "local"); }
  };
}

function createDocumentStub(options = {}) {
  const elements = Object.fromEntries([
    ".todo-shell", ".todo-ball", ".todo-ball-count", ".todo-panel", ".todo-header-settings", ".todo-create-form", ".todo-create-input", ".todo-list", ".todo-toast"
  ].map((selector) => [selector, new ElementStub("div", null, selector, options.rects || {})]));
  for (const element of Object.values(elements)) element.elements = elements;
  elements[".todo-panel"].hidden = true;
  elements[".todo-toast"].hidden = true;

  return {
    elements,
    listeners: {},
    documentElement: { appendChild(node) { node.parentNode = this; } },
    getElementById() { return null; },
    createElement(tagName) { return new ElementStub(tagName, elements); },
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
    dispatch(type, event = {}) { for (const listener of this.listeners[type] || []) listener(event); }
  };
}

class ElementStub {
  constructor(tagName, elements, selector = "", rects = {}) {
    this.tagName = tagName;
    this.elements = elements || {};
    this.selector = selector;
    this.rects = rects;
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.hidden = false;
    this.value = "";
    this.textContent = "";
    this.innerHTMLValue = "";
  }

  set innerHTML(value) { this.innerHTMLValue = value; }
  get innerHTML() { return this.innerHTMLValue; }
  querySelector(selector) { return this.elements[selector] || new ElementStub("div", this.elements, selector, this.rects); }
  contains(target) { return target === this || target?.parentNode === this; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  setAttribute(name, value) { this.attributes[name] = value; }
  dispatch(type, event = {}) { for (const listener of this.listeners[type] || []) listener(event); }
  focus() {}
  select() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() {
    const base = this.rects[this.selector] || { left: 0, top: 0, width: 48, height: 48, right: 48, bottom: 48 };
    const left = Number.parseFloat(this.style.left);
    const top = Number.parseFloat(this.style.top);
    if (!Number.isFinite(left) && !Number.isFinite(top)) return base;
    const nextLeft = Number.isFinite(left) ? left : base.left;
    const nextTop = Number.isFinite(top) ? top : base.top;
    return {
      ...base,
      left: nextLeft,
      top: nextTop,
      right: nextLeft + base.width,
      bottom: nextTop + base.height
    };
  }
}

function createActionTarget(className, dataset, parentNode) {
  return {
    dataset,
    parentNode,
    closest(selector) { return selector === `.${className}` ? this : null; }
  };
}

function createTodoTarget(todoId, parentNode) {
  return {
    dataset: { todoId },
    parentNode,
    classList: { add() {}, remove() {} },
    closest(selector) { return selector === ".todo-item" ? this : null; },
    getBoundingClientRect() { return { top: 10, height: 20 }; }
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
