import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("content source exposes the instrument launcher and panel summary", () => {
  const source = readFileSync("src/content/content.js", "utf8");

  assert.match(source, /class="todo-ball-count"/);
  assert.doesNotMatch(source, /class="todo-ball-badge"/);
  assert.match(source, /class="todo-ball-timer-toggle"/);
  assert.match(source, /class="todo-panel-header"/);
  assert.match(source, /ball\.setAttribute\("aria-label", `未完成待办 \$\{unfinishedCount\} 项`\)/);
});

test("content source exposes an accessible add button and alert toast", () => {
  const source = readFileSync("src/content/content.js", "utf8");

  assert.match(source, /<button class="todo-create-submit" type="submit" aria-label="添加待办" title="添加待办">\$\{iconMarkup\("plus"\)\}<\/button>/);
  assert.match(source, /<div class="todo-toast" role="alert" aria-live="assertive" aria-atomic="true" hidden><\/div>/);
});

test("create input previews and normalizes title URL todos", async () => {
  const { context, document, messages } = createContentContext();

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".todo-create-input"].value = "飞书项目看板 https://project.feishu.cn/xxx";
  document.elements[".todo-create-input"].dispatch("input", {});

  const preview = document.elements[".todo-create-preview"];
  assert.equal(preview.hidden, false);
  assert.match(preview.innerHTML, /将显示为/);
  assert.match(preview.innerHTML, /飞书项目看板/);
  assert.match(preview.innerHTML, /project\.feishu\.cn/);

  document.elements[".todo-create-form"].dispatch("submit", { preventDefault() {} });
  await delay(0);

  const addMessage = messages.find((message) => message.type === "TODO_ADD_TODO");
  assert.equal(addMessage?.payload.text, "[飞书项目看板](https://project.feishu.cn/xxx)");
  assert.equal(preview.hidden, true);
});

test("separate create link input saves the task as a linked title", async () => {
  const { context, document, messages } = createContentContext();

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".todo-create-input"].value = "字段说明";
  document.elements[".todo-create-link-input"].value = "https://example.com/spec";
  document.elements[".todo-create-link-input"].dispatch("input", {});

  const preview = document.elements[".todo-create-preview"];
  assert.equal(preview.hidden, false);
  assert.match(preview.innerHTML, /字段说明/);
  assert.match(preview.innerHTML, /example\.com/);

  document.elements[".todo-create-form"].dispatch("submit", { preventDefault() {} });
  await delay(0);

  const addMessage = messages.find((message) => message.type === "TODO_ADD_TODO");
  assert.equal(addMessage?.payload.text, "[字段说明](https://example.com/spec)");
  assert.equal(document.elements[".todo-create-input"].value, "");
  assert.equal(document.elements[".todo-create-link-input"].value, "");
});

test("content panel positioning uses the screenshot panel width", () => {
  const source = readFileSync("src/content/content.js", "utf8");

  assert.match(source, /const PANEL_WIDTH = 380;/);
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
    now: "2026-07-23T12:00:00",
    items: [{ id: "a", text: "Task A", createdAt: "2026-07-23T10:32:00", reminderAt: "2026-07-23T18:00:00" }]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  const html = document.elements[".todo-list"].innerHTML;
  assert.match(html, /class="todo-action-reminder todo-action-reminder--set"/);
  assert.match(html, /class="todo-created-at">加入 10:32<\/span>/);
  assert.match(html, /class="todo-reminder-chip"/);
  assert.match(html, /提醒 今天 18:00/);
});

test("todo rows render linked titles above existing controls", async () => {
  const { context, document } = createContentContext({
    now: "2026-07-23T12:00:00",
    items: [
      { id: "a", text: "[Project Board](https://project.feishu.cn/path?space=a&task=b)", createdAt: "2026-07-23T10:32:00", reminderAt: "2026-07-23T18:00:00" },
      { id: "b", text: "https://example.com/spec", createdAt: "2026-07-23T09:48:00" },
      { id: "c", text: "A very long plain task name", createdAt: "2026-07-22T16:00:00" }
    ]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  const html = document.elements[".todo-list"].innerHTML;
  assert.match(html, /class="todo-item-title-row"[\s\S]*class="todo-title-link" href="https:\/\/project\.feishu\.cn\/path\?space=a&amp;task=b" target="_blank" rel="noopener noreferrer" title="Project Board">Project Board<\/a>/);
  assert.match(html, /class="todo-title-link" href="https:\/\/example\.com\/spec" target="_blank" rel="noopener noreferrer" title="https:\/\/example\.com\/spec">https:\/\/example\.com\/spec<\/a>/);
  assert.match(html, /class="todo-text" contenteditable="true" data-todo-id="c" title="A very long plain task name">A very long plain task name<\/div>/);
  assert.match(html, /class="todo-created-at">加入 10:32<\/span>/);
  assert.match(html, /class="todo-created-at">加入 09:48<\/span>/);
  assert.match(html, /class="todo-created-at">加入 昨天 16:00<\/span>/);
  assert.ok(html.indexOf("todo-item-title-row") < html.indexOf("todo-item-footer"));
  assert.ok(html.indexOf("todo-item-footer") < html.indexOf("todo-item-actions"));
});

test("content timer controls send timer messages without breaking ball panel toggle", async () => {
  const { context, document, messages } = createContentContext({
    items: [{
      id: "a",
      text: "Task A",
      timerState: "running",
      timerElapsedMs: 60000,
      timerStartedAt: "2026-07-23T09:00:00.000Z",
      timerFocused: true
    }]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".todo-ball"].dispatch("click", {});
  await delay(0);
  assert.equal(document.elements[".todo-panel"].hidden, false);

  document.elements[".todo-ball-timer-toggle"].dispatch("click", { stopPropagation() {} });
  await delay(0);
  const rowTimer = createActionTarget("todo-action-timer", { todoId: "a" }, document.elements[".todo-list"]);
  document.elements[".todo-list"].dispatch("click", { target: rowTimer });
  await delay(0);

  assert.equal(messages.some((message) => message.type === "TODO_TOGGLE_FOCUSED_TODO_TIMER"), true);
  assert.equal(messages.some((message) => message.type === "TODO_TOGGLE_TODO_TIMER"), true);
  assert.equal(document.elements[".todo-panel"].hidden, false);
});

test("content ball separates timer display from the bottom pause button", () => {
  const source = readFileSync("src/content/content.js", "utf8");
  const ballMarkup = source.match(/<button class="todo-ball"[\s\S]*?<\/button>/)?.[0] || "";
  const timerToggleMarkup = source.match(/<button class="todo-ball-timer-toggle"[\s\S]*?<\/button>/)?.[0] || "";

  assert.match(ballMarkup, /todo-ball-timer-value/);
  assert.match(timerToggleMarkup, /todo-ball-timer-icon/);
  assert.doesNotMatch(timerToggleMarkup, /todo-ball-timer-value/);
});

test("content ball timer uses compact text that fits the ball", async () => {
  const { context, document } = createContentContext({
    items: [{
      id: "a",
      text: "Task A",
      timerState: "paused",
      timerElapsedMs: 3723000,
      timerStartedAt: "",
      timerFocused: true
    }]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  assert.equal(document.elements[".todo-ball-timer-toggle"].hidden, false);
  assert.equal(document.elements[".todo-ball-timer-value"].textContent, "1h02m");
  assert.equal(document.elements[".todo-ball-timer-value"].attributes.title, "1h02m");
});

test("content ball timer renders half-hour progress from the earliest active timer", async () => {
  const { context, document } = createContentContext({
    now: "2026-07-23T09:10:00.000Z",
    settings: { ballThemeColor: "#2563eb", colorPresets: ["#ffffff"] },
    items: [
      {
        id: "late",
        text: "Late",
        timerState: "running",
        timerElapsedMs: 0,
        timerStartedAt: "2026-07-23T09:05:00.000Z",
        timerLastTickAt: "2026-07-23T09:05:00.000Z",
        timerFirstStartedAt: "2026-07-23T09:05:00.000Z",
        timerFocused: false
      },
      {
        id: "early",
        text: "Early",
        timerState: "running",
        timerElapsedMs: 0,
        timerStartedAt: "2026-07-23T09:00:00.000Z",
        timerLastTickAt: "2026-07-23T09:00:00.000Z",
        timerFirstStartedAt: "2026-07-23T09:00:00.000Z",
        timerFocused: true
      }
    ]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  assert.equal(document.elements[".todo-ball-timer-value"].textContent, "10:00");
  assert.equal(document.elements[".todo-ball"].style["--todo-ball-progress"], "120deg");
  assert.equal(document.elements[".todo-ball"].style["--todo-ball-progress-color"], "#92b1f5");
  assert.equal(document.elements[".todo-ball"].dataset.timerCount, "2");
  assert.equal(document.elements[".todo-ball-timer-toggle"].attributes["aria-label"], "暂停全部计时");
});

test("content ball title shows the earliest running task while timing", async () => {
  const { context, document } = createContentContext({
    now: "2026-07-23T09:10:00.000Z",
    items: [
      {
        id: "late",
        text: "Later task",
        timerState: "running",
        timerElapsedMs: 0,
        timerStartedAt: "2026-07-23T09:05:00.000Z",
        timerFirstStartedAt: "2026-07-23T09:05:00.000Z"
      },
      {
        id: "early",
        text: "[Important Board](https://example.com/board)",
        timerState: "running",
        timerElapsedMs: 0,
        timerStartedAt: "2026-07-23T09:00:00.000Z",
        timerFirstStartedAt: "2026-07-23T09:00:00.000Z"
      }
    ]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  assert.equal(document.elements[".todo-ball"].title, "正在进行：Important Board");
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
  const { context, document } = createContentContext({
    innerHeight: 500,
    rects: {
      ".todo-panel": { left: 0, top: 0, width: 376, height: 476, right: 376, bottom: 476 }
    }
  });

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
  const { context, document } = createContentContext({
    rects: {
      ".todo-panel": { left: 0, top: 0, width: 376, height: 476, right: 376, bottom: 476 }
    }
  });

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
  assert.equal(persisted?.side, "left");
  assert.equal(document.elements[".todo-shell"].dataset.todoEdge, "left");
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
  assert.equal(document.elements[".todo-shell"].dataset.todoEdge, "right");
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
  assert.equal(document.elements[".todo-shell"].dataset.todoEdge, "right");

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
  assert.equal(document.elements[".todo-shell"].dataset.todoEdge, "right");
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
  const DateConstructor = options.now ? createFixedDate(options.now) : Date;
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
    Date: DateConstructor,
    URL
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
    ".todo-shell", ".todo-ball", ".todo-ball-count", ".todo-ball-timer-toggle", ".todo-ball-timer-value", ".todo-ball-timer-icon", ".todo-panel", ".todo-header-settings", ".todo-create-form", ".todo-create-input", ".todo-create-link-input", ".todo-create-preview", ".todo-list", ".todo-toast"
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
    this.style = { setProperty(name, value) { this[name] = value; } };
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

function createFixedDate(nowValue) {
  const nowTime = Date.parse(nowValue);
  return class FixedDate extends Date {
    constructor(value) {
      super(arguments.length ? value : nowTime);
    }

    static now() {
      return nowTime;
    }
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
