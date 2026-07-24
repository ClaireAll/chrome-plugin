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
  const PANEL_WIDTH = 420;
  const PANEL_HEIGHT = 560;
  const PANEL_VIEWPORT_MARGIN = 12;
  const TOAST_MAX_WIDTH = 300;
  const TOAST_FALLBACK_HEIGHT = 44;
  const TOAST_GAP = 8;
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
      <button class="todo-ball" type="button" title="todo" aria-label="todo"></button>
      <section class="todo-panel" hidden>
        <form class="todo-create-form">
          <input class="todo-create-input" autocomplete="off" />
        </form>
        <div class="todo-list"></div>
      </section>
      <div class="todo-toast" hidden></div>
    </div>
  `;
  document.documentElement.appendChild(root);

  const shell = root.querySelector(".todo-shell");
  const ball = root.querySelector(".todo-ball");
  const panel = root.querySelector(".todo-panel");
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
  createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runSafely(addTodo());
  });
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
    ball.textContent = String(state.items.length);
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
              <button class="todo-action-color" type="button" data-todo-id="${escapeAttribute(item.id)}" title="Color" aria-label="Color">●</button>
              <button class="todo-action-reminder" type="button" data-todo-id="${escapeAttribute(item.id)}" title="Reminder" aria-label="Reminder">◷</button>
              <button class="todo-action-complete" type="button" data-todo-id="${escapeAttribute(item.id)}" title="Complete" aria-label="Complete">✔️</button>
              <button class="todo-action-delete" type="button" data-todo-id="${escapeAttribute(item.id)}" title="Delete" aria-label="Delete">❌</button>
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
    applyBallPosition({ left, top, side, snapped });
    state.ballDrag = null;
    persistBallPosition({ left, top, side, snapped });
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
    if (!position || !Number.isFinite(Number(position.left)) || !Number.isFinite(Number(position.top))) return;
    const rect = shell.getBoundingClientRect();
    const left = clamp(Number(position.left), 0, Math.max(0, window.innerWidth - rect.width));
    const top = clamp(Number(position.top), 0, Math.max(0, window.innerHeight - rect.height));
    const normalized = {
      left,
      top,
      side: position.side === "left" || position.side === "right" ? position.side : null,
      snapped: position.snapped === true
    };
    state.ballPosition = normalized;
    shell.style.left = `${left}px`;
    shell.style.top = `${top}px`;
    shell.style.right = "auto";
    shell.style.transform = "none";
    return {
      corrected: left !== Number(position.left) || top !== Number(position.top),
      position: normalized
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

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
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
