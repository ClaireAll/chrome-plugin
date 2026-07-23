import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

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
  assert.equal(messages.filter((message) => message.type === "TODO_UPDATE_SETTINGS").length, 1);
});

test("restored ball positions are clamped and the correction is persisted", async () => {
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
  assert.equal(corrected?.left, 1152);
  assert.equal(corrected?.top, 752);
  assert.equal(corrected?.snapped, false);
  assert.equal(corrected?.side, null);
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

  assert.equal(document.elements[".todo-ball"].textContent, "2");
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

function createContentContext(options = {}) {
  const document = createDocumentStub();
  let backgroundItems = options.items || [];
  const messages = [];
  let storageChangeListener;
  const context = {
    chrome: {
      runtime: {
        lastError: null,
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
      setTimeout,
      clearTimeout
    },
    setTimeout,
    clearTimeout,
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
    setBackgroundItems(items) { backgroundItems = items; },
    dispatchStorageChange(changes) { storageChangeListener?.(changes, "local"); }
  };
}

function createDocumentStub() {
  const elements = Object.fromEntries([
    ".todo-shell", ".todo-ball", ".todo-panel", ".todo-create-form", ".todo-create-input", ".todo-list", ".todo-toast"
  ].map((selector) => [selector, new ElementStub("div", null)]));
  for (const element of Object.values(elements)) element.elements = elements;
  elements[".todo-panel"].hidden = true;
  elements[".todo-toast"].hidden = true;

  return {
    elements,
    documentElement: { appendChild(node) { node.parentNode = this; } },
    getElementById() { return null; },
    createElement(tagName) { return new ElementStub(tagName, elements); },
    addEventListener() {}
  };
}

class ElementStub {
  constructor(tagName, elements) {
    this.tagName = tagName;
    this.elements = elements || {};
    this.dataset = {};
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
  querySelector(selector) { return this.elements[selector] || new ElementStub("div", this.elements); }
  contains(target) { return target === this || target?.parentNode === this; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatch(type, event = {}) { for (const listener of this.listeners[type] || []) listener(event); }
  focus() {}
  select() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 48, height: 48 }; }
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
