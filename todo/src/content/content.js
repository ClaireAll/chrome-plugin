(() => {
  if (document.getElementById("todo-extension-root")) return;

  const MESSAGE_TYPES = {
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
    OPEN_OPTIONS: "TODO_OPEN_OPTIONS"
  };
  const DEFAULT_COLORS = ["#ffffff", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#ede9fe"];
  const EDGE_SNAP_THRESHOLD = 24;
  const PANEL_WIDTH = 320;
  const PANEL_HEIGHT = 560;
  const PANEL_VIEWPORT_MARGIN = 12;
  const TOAST_MAX_WIDTH = 300;
  const TOAST_FALLBACK_HEIGHT = 44;
  const TOAST_GAP = 8;
  const TODO_ICONS = Object.freeze({
    settings: `
      <svg class="todo-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `,
    bell: `
      <svg class="todo-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.268 21a2 2 0 0 0 3.464 0"></path>
        <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>
      </svg>
    `,
    "check-circle": `
      <svg class="todo-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="m9 12 2 2 4-4"></path>
      </svg>
    `,
    "trash-2": `
      <svg class="todo-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18"></path>
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
      </svg>
    `
  });
  const state = {
    items: [],
    settings: { colorPresets: DEFAULT_COLORS },
    isOpen: false,
    activeColorId: "",
    activeReminderId: "",
    draggedTodoId: "",
    reorderOperations: [],
    ballDrag: null,
    ballDragMoved: false,
    ballPosition: null
  };

  const root = document.createElement("div");
  root.id = "todo-extension-root";
  root.innerHTML = `
    <div class="todo-shell">
      <button class="todo-ball" type="button" title="待办" aria-label="未完成待办 0 项">
        <span class="todo-ball-tick todo-ball-tick--teal" aria-hidden="true"></span>
        <span class="todo-ball-tick todo-ball-tick--coral" aria-hidden="true"></span>
        <span class="todo-ball-count" aria-hidden="true"></span>
      </button>
      <section class="todo-panel" hidden>
        <header class="todo-panel-header">
          <h2>我的待办</h2>
          <div class="todo-panel-header-actions">
            <button class="todo-header-settings" type="button" aria-label="打开设置" title="打开设置">${iconMarkup("settings")}</button>
          </div>
        </header>
        <form class="todo-create-form">
          <input class="todo-create-input" autocomplete="off" placeholder="添加新任务..." />
          <button class="todo-create-submit" type="submit" aria-label="添加待办">添加</button>
        </form>
        <div class="todo-list"></div>
      </section>
      <div class="todo-toast" role="alert" aria-live="assertive" aria-atomic="true" hidden></div>
    </div>
  `;
  document.documentElement.appendChild(root);

  const shell = root.querySelector(".todo-shell");
  const ball = root.querySelector(".todo-ball");
  const ballCount = root.querySelector(".todo-ball-count");
  const panel = root.querySelector(".todo-panel");
  const headerSettings = root.querySelector(".todo-header-settings");
  const createForm = root.querySelector(".todo-create-form");
  const createInput = root.querySelector(".todo-create-input");
  const list = root.querySelector(".todo-list");
  const toast = root.querySelector(".todo-toast");

  ball.addEventListener("click", () => {
    if (state.ballDragMoved) {
      state.ballDragMoved = false;
      return;
    }
    runSafely(togglePanel(!state.isOpen));
  });
  ball.addEventListener("pointerdown", startBallDrag);
  ball.addEventListener("pointermove", moveBallDrag);
  ball.addEventListener("pointerup", finishBallDrag);
  ball.addEventListener("pointercancel", cancelBallDrag);
  headerSettings.addEventListener("click", openOptionsPage);
  createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runSafely(addTodo());
  });
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  list.addEventListener("click", handleListClick);
  list.addEventListener("change", handleListChange);
  list.addEventListener("keydown", handleListKeydown);
  list.addEventListener("blur", handleListBlur, true);
  list.addEventListener("dragstart", handleTodoDragStart);
  list.addEventListener("dragover", handleTodoDragOver);
  list.addEventListener("drop", handleTodoDrop);
  list.addEventListener("dragend", clearTodoDrag);
  window.addEventListener("resize", () => {
    persistClampedBallPosition();
    if (state.isOpen) positionPanel();
    if (!toast.hidden) positionToast();
  });
  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === "local" && (changes.todoUnfinishedItems || changes.todoSettings)) runSafely(refreshState());
  });

  runSafely(refreshState());

  async function togglePanel(open) {
    if (!open) await persistReorder();
    state.isOpen = open;
    panel.hidden = !open;
    shell.classList.toggle("todo-open", open);
    if (open) {
      positionPanel();
      await refreshState();
      createInput.focus();
    }
  }

  async function refreshState() {
    const response = await sendMessage({ type: MESSAGE_TYPES.GET_STATE });
    if (!response?.ok) {
      showToast(response?.message || "Unable to load todos");
      return;
    }
    state.items = reconcilePendingReorders(Array.isArray(response.items) ? response.items : []);
    state.settings = response.settings || state.settings;
    const correctedPosition = applyBallPosition(state.settings.ballPosition);
    if (correctedPosition?.corrected) persistBallPosition(correctedPosition.position);
    render();
  }

  function render() {
    const unfinishedCount = state.items.length;
    ballCount.textContent = String(unfinishedCount);
    ball.setAttribute("aria-label", `未完成待办 ${unfinishedCount} 项`);
    renderList();
  }

  function renderList() {
    if (!state.items.length) {
      list.innerHTML = `<div class="todo-empty">No unfinished todos</div>`;
      return;
    }
    list.innerHTML = state.items.map((item) => {
      const colorPalette = state.activeColorId === item.id ? renderColorPalette(item) : "";
      const reminder = state.activeReminderId === item.id ? renderReminderPopover(item) : "";
      return `
        <article class="todo-item" draggable="true" data-todo-id="${escapeAttribute(item.id)}" style="--todo-color:${escapeAttribute(item.color || "#ffffff")}">
          <div class="todo-item-main">
            <div class="todo-text" contenteditable="true" data-todo-id="${escapeAttribute(item.id)}">${escapeHtml(item.text)}</div>
            <div class="todo-item-actions">
              <button class="todo-action-color" type="button" data-todo-id="${escapeAttribute(item.id)}" title="选择颜色" aria-label="选择颜色"><span class="todo-color-dot" aria-hidden="true"></span></button>
              <button class="todo-action-reminder" type="button" data-todo-id="${escapeAttribute(item.id)}" title="设置提醒" aria-label="设置提醒">${iconMarkup("bell")}</button>
              <button class="todo-action-complete" type="button" data-todo-id="${escapeAttribute(item.id)}" title="完成" aria-label="完成">${iconMarkup("check-circle")}</button>
              <button class="todo-action-delete" type="button" data-todo-id="${escapeAttribute(item.id)}" title="删除" aria-label="删除">${iconMarkup("trash-2")}</button>
            </div>
          </div>
          ${colorPalette}
          ${reminder}
        </article>
      `;
    }).join("");
  }

  function renderColorPalette(item) {
    const presets = Array.isArray(state.settings.colorPresets) && state.settings.colorPresets.length
      ? state.settings.colorPresets
      : DEFAULT_COLORS;
    return `<div class="todo-color-palette">${presets.map((color) => `
      <button class="todo-color-choice" type="button" data-todo-id="${escapeAttribute(item.id)}" data-color="${escapeAttribute(color)}" style="--todo-choice-color:${escapeAttribute(color)}" aria-label="${escapeAttribute(color)}"></button>
    `).join("")}</div>`;
  }

  function renderReminderPopover(item) {
    return `<div class="todo-reminder-popover">
      <input class="todo-reminder-input" type="datetime-local" data-todo-id="${escapeAttribute(item.id)}" value="${toDateTimeLocal(item.reminderAt)}" />
      <button class="todo-reminder-clear" type="button" data-todo-id="${escapeAttribute(item.id)}">Clear</button>
    </div>`;
  }

  async function addTodo() {
    const text = createInput.value.trim();
    if (!text) return;
    const response = await sendMessage({ type: MESSAGE_TYPES.ADD_TODO, payload: { text } });
    if (!applyItemsResponse(response, "Unable to add todo")) return;
    createInput.value = "";
  }

  async function updateText(todoId, text) {
    const normalizedText = String(text || "").trim();
    const current = state.items.find((item) => item.id === todoId);
    if (!current || !normalizedText || current.text === normalizedText) {
      renderList();
      return;
    }
    applyItemsResponse(await sendMessage({
      type: MESSAGE_TYPES.UPDATE_TODO_TEXT,
      payload: { id: todoId, text: normalizedText }
    }), "Unable to update todo");
  }

  async function updateColor(todoId, color) {
    state.activeColorId = "";
    applyItemsResponse(await sendMessage({
      type: MESSAGE_TYPES.UPDATE_TODO_COLOR,
      payload: { id: todoId, color }
    }), "Unable to update color");
  }

  async function updateReminder(todoId, reminderAt) {
    if (!reminderAt) return;
    state.activeReminderId = "";
    applyItemsResponse(await sendMessage({
      type: MESSAGE_TYPES.UPDATE_TODO_REMINDER,
      payload: { id: todoId, reminderAt: new Date(reminderAt).toISOString() }
    }), "Unable to set reminder");
  }

  async function clearReminder(todoId) {
    state.activeReminderId = "";
    applyItemsResponse(await sendMessage({
      type: MESSAGE_TYPES.CLEAR_TODO_REMINDER,
      payload: { id: todoId }
    }), "Unable to clear reminder");
  }

  async function completeTodo(todoId) {
    const response = await sendMessage({
      type: MESSAGE_TYPES.COMPLETE_TODO,
      payload: { id: todoId, completedAt: new Date().toISOString() }
    });
    applyItemsResponse(response, "Unable to complete todo");
  }

  function openOptionsPage() {
    runSafely(sendMessage({ type: MESSAGE_TYPES.OPEN_OPTIONS }));
  }

  async function deleteTodo(todoId) {
    applyItemsResponse(await sendMessage({
      type: MESSAGE_TYPES.DELETE_TODO,
      payload: { id: todoId }
    }), "Unable to delete todo");
  }

  function applyItemsResponse(response, fallbackMessage) {
    if (!response?.ok || !Array.isArray(response.items)) {
      showToast(response?.message || fallbackMessage);
      return false;
    }
    state.items = response.items;
    render();
    return true;
  }

  function handleDocumentPointerDown(event) {
    if (!state.isOpen) return;
    const target = event.target;
    if (target && (root.contains(target) || shell.contains(target) || ball.contains(target) || panel.contains(target))) return;
    runSafely(togglePanel(false));
  }

  function handleListClick(event) {
    const colorButton = event.target.closest?.(".todo-action-color");
    if (colorButton && list.contains(colorButton)) {
      state.activeColorId = state.activeColorId === colorButton.dataset.todoId ? "" : colorButton.dataset.todoId;
      state.activeReminderId = "";
      renderList();
      return;
    }
    const colorChoice = event.target.closest?.(".todo-color-choice");
    if (colorChoice && list.contains(colorChoice)) return runSafely(updateColor(colorChoice.dataset.todoId, colorChoice.dataset.color));
    const reminderButton = event.target.closest?.(".todo-action-reminder");
    if (reminderButton && list.contains(reminderButton)) {
      state.activeReminderId = state.activeReminderId === reminderButton.dataset.todoId ? "" : reminderButton.dataset.todoId;
      state.activeColorId = "";
      renderList();
      return;
    }
    const clearButton = event.target.closest?.(".todo-reminder-clear");
    if (clearButton && list.contains(clearButton)) return runSafely(clearReminder(clearButton.dataset.todoId));
    const completeButton = event.target.closest?.(".todo-action-complete");
    if (completeButton && list.contains(completeButton)) return runSafely(completeTodo(completeButton.dataset.todoId));
    const deleteButton = event.target.closest?.(".todo-action-delete");
    if (deleteButton && list.contains(deleteButton)) runSafely(deleteTodo(deleteButton.dataset.todoId));
  }

  function handleListChange(event) {
    const reminderInput = event.target.closest?.(".todo-reminder-input");
    if (reminderInput && list.contains(reminderInput)) runSafely(updateReminder(reminderInput.dataset.todoId, reminderInput.value));
  }

  function handleListKeydown(event) {
    const text = event.target.closest?.(".todo-text");
    if (text && event.key === "Enter") {
      event.preventDefault();
      text.blur();
    }
  }

  function handleListBlur(event) {
    const text = event.target.closest?.(".todo-text");
    if (text && list.contains(text)) runSafely(updateText(text.dataset.todoId, text.textContent));
  }

  function handleTodoDragStart(event) {
    const item = event.target.closest?.(".todo-item");
    if (!item || !list.contains(item)) return;
    state.draggedTodoId = item.dataset.todoId;
    event.dataTransfer?.setData("text/plain", state.draggedTodoId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function handleTodoDragOver(event) {
    const item = event.target.closest?.(".todo-item");
    if (!item || !state.draggedTodoId || item.dataset.todoId === state.draggedTodoId) return;
    event.preventDefault();
    item.classList.add("todo-drag-over");
  }

  function handleTodoDrop(event) {
    const target = event.target.closest?.(".todo-item");
    const sourceId = state.draggedTodoId;
    clearTodoDrag();
    if (!target || !sourceId || target.dataset.todoId === sourceId) return;
    event.preventDefault();
    const rect = target.getBoundingClientRect();
    const position = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    const sourceIndex = state.items.findIndex((item) => item.id === sourceId);
    const targetIndex = state.items.findIndex((item) => item.id === target.dataset.todoId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = state.items.splice(sourceIndex, 1);
    const insertionIndex = state.items.findIndex((item) => item.id === target.dataset.todoId) + (position === "after" ? 1 : 0);
    state.items.splice(insertionIndex, 0, moved);
    state.reorderOperations.push({ sourceId, targetId: target.dataset.todoId, position });
    render();
  }

  function clearTodoDrag() {
    state.draggedTodoId = "";
    for (const item of list.querySelectorAll?.(".todo-drag-over") || []) item.classList.remove("todo-drag-over");
  }

  async function persistReorder() {
    const operations = state.reorderOperations.splice(0);
    for (const operation of operations) {
      const response = await sendMessage({ type: MESSAGE_TYPES.REORDER_TODOS, payload: operation });
      if (!response?.ok || !Array.isArray(response.items)) {
        showToast(response?.message || "Unable to reorder todos");
        await refreshState();
        return;
      }
      state.items = response.items;
    }
    render();
  }

  function startBallDrag(event) {
    const rect = shell.getBoundingClientRect();
    state.ballDrag = { startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
    state.ballDragMoved = false;
    ball.setPointerCapture?.(event.pointerId);
  }

  function moveBallDrag(event) {
    if (!state.ballDrag) return;
    const left = clamp(state.ballDrag.left + event.clientX - state.ballDrag.startX, 0, window.innerWidth - shell.getBoundingClientRect().width);
    const top = clamp(state.ballDrag.top + event.clientY - state.ballDrag.startY, 0, window.innerHeight - shell.getBoundingClientRect().height);
    state.ballDragMoved ||= Math.abs(event.clientX - state.ballDrag.startX) > 3 || Math.abs(event.clientY - state.ballDrag.startY) > 3;
    shell.style.left = `${left}px`;
    shell.style.top = `${top}px`;
    shell.style.right = "auto";
    shell.style.transform = "none";
  }

  function finishBallDrag(event) {
    if (!state.ballDrag) return;
    ball.releasePointerCapture?.(event.pointerId);
    if (!state.ballDragMoved) {
      state.ballDrag = null;
      return;
    }
    const rect = shell.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    let left = clamp(rect.left, 0, maxLeft);
    const top = clamp(rect.top, 0, Math.max(0, window.innerHeight - rect.height));
    let side = null;
    let snapped = false;
    if (left <= EDGE_SNAP_THRESHOLD) {
      left = 0;
      side = "left";
      snapped = true;
    } else if (maxLeft - left <= EDGE_SNAP_THRESHOLD) {
      left = maxLeft;
      side = "right";
      snapped = true;
    }
    const position = createRatioBallPosition(left, top, side, snapped, rect);
    applyBallPosition(position);
    state.ballDrag = null;
    persistBallPosition(position);
  }

  function cancelBallDrag(event) {
    if (!state.ballDrag) return;
    ball.releasePointerCapture?.(event.pointerId);
    state.ballDrag = null;
    state.ballDragMoved = false;
  }

  function positionPanel() {
    const ballRect = shell.getBoundingClientRect();
    const { width: panelWidth, height: panelHeight } = getEffectivePanelDimensions();
    const maxLeft = Math.max(PANEL_VIEWPORT_MARGIN, window.innerWidth - panelWidth - PANEL_VIEWPORT_MARGIN);
    const maxTop = Math.max(PANEL_VIEWPORT_MARGIN, window.innerHeight - panelHeight - PANEL_VIEWPORT_MARGIN);
    const ballRight = Number.isFinite(ballRect.right) ? ballRect.right : ballRect.left + ballRect.width;
    const ballBottom = Number.isFinite(ballRect.bottom) ? ballRect.bottom : ballRect.top + ballRect.height;
    const top = ballBottom + PANEL_VIEWPORT_MARGIN + panelHeight <= window.innerHeight - PANEL_VIEWPORT_MARGIN
      ? ballBottom + PANEL_VIEWPORT_MARGIN
      : ballRect.top - PANEL_VIEWPORT_MARGIN - panelHeight >= PANEL_VIEWPORT_MARGIN
        ? ballRect.top - PANEL_VIEWPORT_MARGIN - panelHeight
        : clamp(ballRect.top - (panelHeight - ballRect.height) / 2, PANEL_VIEWPORT_MARGIN, maxTop);
    const left = clamp(ballRight - panelWidth, PANEL_VIEWPORT_MARGIN, maxLeft);
    panel.style.position = "fixed";
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function getEffectivePanelDimensions() {
    return {
      width: Math.max(0, Math.min(PANEL_WIDTH, window.innerWidth - PANEL_VIEWPORT_MARGIN * 2)),
      height: Math.max(0, Math.min(PANEL_HEIGHT, window.innerHeight - PANEL_VIEWPORT_MARGIN * 2))
    };
  }

  function applyBallPosition(position) {
    const rect = shell.getBoundingClientRect();
    const applied = resolveBallPosition(position, rect);
    if (!applied) return;
    state.ballPosition = applied.position;
    shell.style.left = `${applied.left}px`;
    shell.style.top = `${applied.top}px`;
    shell.style.right = "auto";
    shell.style.transform = "none";
    return {
      corrected: applied.corrected,
      position: applied.position
    };
  }

  function resolveBallPosition(position, rect) {
    if (!position || typeof position !== "object") return null;
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    const side = position.side === "left" || position.side === "right" ? position.side : null;
    const snapped = position.snapped === true;
    const rawLeftRatio = Number(position.leftRatio);
    const rawTopRatio = Number(position.topRatio);
    if (Number.isFinite(rawLeftRatio) || Number.isFinite(rawTopRatio)) {
      const leftRatio = clampRatio(rawLeftRatio);
      const topRatio = clampRatio(rawTopRatio);
      return {
        left: Math.round(leftRatio * maxLeft),
        top: Math.round(topRatio * maxTop),
        corrected: leftRatio !== rawLeftRatio || topRatio !== rawTopRatio,
        position: { leftRatio, topRatio, snapped, side }
      };
    }
    const left = clamp(Number(position.left), 0, maxLeft);
    const top = clamp(Number(position.top), 0, maxTop);
    return {
      left,
      top,
      corrected: true,
      position: createRatioBallPosition(left, top, side, snapped, rect)
    };
  }

  function createRatioBallPosition(left, top, side, snapped, rect = shell.getBoundingClientRect()) {
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    return {
      leftRatio: maxLeft > 0 ? clamp(left, 0, maxLeft) / maxLeft : 0,
      topRatio: maxTop > 0 ? clamp(top, 0, maxTop) / maxTop : 0,
      snapped: snapped === true,
      side
    };
  }

  function persistClampedBallPosition() {
    const applied = applyBallPosition(state.ballPosition);
    if (applied?.corrected) persistBallPosition(applied.position);
  }

  function persistBallPosition(position) {
    runSafely(sendMessage({ type: MESSAGE_TYPES.UPDATE_SETTINGS, payload: { ballPosition: position } }));
  }

  function reconcilePendingReorders(items) {
    let reconciled = items;
    for (const operation of state.reorderOperations) {
      const sourceExists = reconciled.some((item) => item.id === operation.sourceId);
      const targetExists = reconciled.some((item) => item.id === operation.targetId);
      if (sourceExists && targetExists) {
        const sourceIndex = reconciled.findIndex((item) => item.id === operation.sourceId);
        const targetIndex = reconciled.findIndex((item) => item.id === operation.targetId);
        const [moved] = reconciled.splice(sourceIndex, 1);
        const insertionIndex = reconciled.findIndex((item) => item.id === operation.targetId) + (operation.position === "after" ? 1 : 0);
        reconciled.splice(insertionIndex, 0, moved);
      }
    }
    return reconciled;
  }

  function showToast(message) {
    toast.textContent = String(message || "Operation failed");
    toast.hidden = false;
    positionToast();
    window.clearTimeout?.(showToast.timer);
    showToast.timer = window.setTimeout?.(() => { toast.hidden = true; }, 4000);
  }

  function positionToast() {
    const ballRect = shell.getBoundingClientRect();
    const width = Math.max(0, Math.min(TOAST_MAX_WIDTH, window.innerWidth - PANEL_VIEWPORT_MARGIN * 2));
    toast.style.position = "fixed";
    toast.style.width = `${width}px`;
    toast.style.right = "auto";
    toast.style.bottom = "auto";
    const toastRect = toast.getBoundingClientRect();
    const height = Number.isFinite(toastRect.height) && toastRect.height > 0 ? toastRect.height : TOAST_FALLBACK_HEIGHT;
    const maxLeft = Math.max(PANEL_VIEWPORT_MARGIN, window.innerWidth - width - PANEL_VIEWPORT_MARGIN);
    const maxTop = Math.max(PANEL_VIEWPORT_MARGIN, window.innerHeight - height - PANEL_VIEWPORT_MARGIN);
    const belowTop = ballRect.bottom + TOAST_GAP;
    const aboveTop = ballRect.top - height - TOAST_GAP;
    const top = belowTop + height <= window.innerHeight - PANEL_VIEWPORT_MARGIN ? belowTop : aboveTop;
    toast.style.left = `${clamp(ballRect.left, PANEL_VIEWPORT_MARGIN, maxLeft)}px`;
    toast.style.top = `${clamp(top, PANEL_VIEWPORT_MARGIN, maxTop)}px`;
  }

  function sendMessage(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      resolve(error ? { ok: false, message: error.message } : response);
    }));
  }

  function runSafely(promise) {
    Promise.resolve(promise).catch((error) => showToast(error?.message || "Operation failed"));
  }

  function iconMarkup(name) {
    return TODO_ICONS[name] || "";
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function clampRatio(value) {
    return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
  }

  function toDateTimeLocal(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
