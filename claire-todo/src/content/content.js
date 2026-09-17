(() => {
  if (document.getElementById("todo-extension-root")) return;

  const MESSAGE_TYPES = {
    GET_STATE: "TODO_GET_STATE",
    ADD_TODO: "TODO_ADD_TODO",
    UPDATE_TODO_TEXT: "TODO_UPDATE_TODO_TEXT",
    UPDATE_TODO_COLOR: "TODO_UPDATE_TODO_COLOR",
    UPDATE_TODO_REMINDER: "TODO_UPDATE_TODO_REMINDER",
    CLEAR_TODO_REMINDER: "TODO_CLEAR_TODO_REMINDER",
    TOGGLE_TODO_TIMER: "TODO_TOGGLE_TODO_TIMER",
    TOGGLE_FOCUSED_TODO_TIMER: "TODO_TOGGLE_FOCUSED_TODO_TIMER",
    TOUCH_TODO_TIMER: "TODO_TOUCH_TODO_TIMER",
    DELETE_TODO: "TODO_DELETE_TODO",
    REORDER_TODOS: "TODO_REORDER_TODOS",
    COMPLETE_TODO: "TODO_COMPLETE_TODO",
    UPDATE_SETTINGS: "TODO_UPDATE_SETTINGS",
    OPEN_OPTIONS: "TODO_OPEN_OPTIONS",
    REMINDER_DUE: "TODO_REMINDER_DUE"
  };
  const DEFAULT_COLORS = ["#ffffff", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#ede9fe"];
  const PANEL_WIDTH = 380;
  const PANEL_HEIGHT = 560;
  const PANEL_VIEWPORT_MARGIN = 12;
  const TOAST_MAX_WIDTH = 300;
  const TOAST_FALLBACK_HEIGHT = 44;
  const TOAST_GAP = 8;
  const TIMER_RENDER_INTERVAL_MS = 1000;
  const TIMER_HEARTBEAT_INTERVAL_MS = 5000;
  const TIMER_PROGRESS_CYCLE_MS = 30 * 60 * 1000;
  const BALL_SIZE_MIN = 36;
  const BALL_SIZE_MAX = 88;
  const BALL_SIZE_DEFAULT = 44;
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
    `,
    "clipboard-list": `
      <svg class="todo-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect width="8" height="4" x="8" y="2" rx="1"></rect>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
        <path d="M8 11h8"></path>
        <path d="M8 16h6"></path>
      </svg>
    `,
    plus: `
      <svg class="todo-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14"></path>
        <path d="M12 5v14"></path>
      </svg>
    `,
    calendar: `
      <svg class="todo-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 2v4"></path>
        <path d="M16 2v4"></path>
        <rect width="18" height="18" x="3" y="4" rx="2"></rect>
        <path d="M3 10h18"></path>
      </svg>
    `,
    link: `
      <svg class="todo-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93"></path>
        <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19.07"></path>
      </svg>
    `,
    "alarm-clock": `
      <svg class="todo-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="13" r="8"></circle>
        <path d="M12 9v4l2.5 2"></path>
        <path d="M5 3 2 6"></path>
        <path d="m22 6-3-3"></path>
        <path d="M6.4 19.6 4.8 21"></path>
        <path d="m17.6 19.6 1.6 1.4"></path>
      </svg>
    `,
    pause: `
      <svg class="todo-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="5" width="4" height="14" rx="1"></rect>
        <rect x="14" y="5" width="4" height="14" rx="1"></rect>
      </svg>
    `,
    play: `
      <svg class="todo-icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M8 5.6v12.8c0 .9 1 1.4 1.8.9l9.8-6.4a1.1 1.1 0 0 0 0-1.8L9.8 4.7C9 4.2 8 4.7 8 5.6Z"></path>
      </svg>
    `
  });
  const state = {
    items: [],
    settings: { ballSize: BALL_SIZE_DEFAULT, ballThemeColor: "#2563eb", colorPresets: DEFAULT_COLORS },
    isOpen: false,
    activeColorId: "",
    activeReminderId: "",
    draggedTodoId: "",
    reorderOperations: [],
    ballDrag: null,
    ballDragMoved: false,
    ballPosition: null,
    timerRenderInterval: 0,
    timerHeartbeatInterval: 0
  };

  const root = document.createElement("div");
  root.id = "todo-extension-root";
  root.innerHTML = `
    <div class="todo-shell" data-todo-edge="right">
      <button class="todo-ball" type="button" title="待办" aria-label="未完成待办 0 项">
        <span class="todo-ball-count" aria-hidden="true"></span>
        <span class="todo-ball-timer-value" aria-hidden="true"></span>
      </button>
      <button class="todo-ball-timer-toggle" type="button" aria-label="暂停计时" title="暂停计时" hidden>
        <span class="todo-ball-timer-icon" aria-hidden="true"></span>
      </button>
      <section class="todo-panel" hidden>
        <header class="todo-panel-header">
          <div class="todo-panel-title">
            <span class="todo-panel-title-icon" aria-hidden="true">${iconMarkup("clipboard-list")}</span>
            <h2>我的待办</h2>
            <span class="todo-panel-count" aria-label="未完成待办 0 项">0</span>
          </div>
          <div class="todo-panel-header-actions">
            <button class="todo-header-settings" type="button" aria-label="打开设置" title="打开设置">${iconMarkup("settings")}</button>
          </div>
        </header>
        <form class="todo-create-form">
          <div class="todo-create-control">
            <span class="todo-create-icon" aria-hidden="true">${iconMarkup("plus")}</span>
            <input class="todo-create-input" autocomplete="off" placeholder="添加新任务..." />
            <kbd class="todo-create-key">Enter</kbd>
          </div>
          <button class="todo-create-submit" type="submit" aria-label="添加待办" title="添加待办">${iconMarkup("plus")}</button>
          <div class="todo-create-control todo-create-link-control">
            <span class="todo-create-icon" aria-hidden="true">${iconMarkup("link")}</span>
            <input class="todo-create-link-input" autocomplete="off" inputmode="url" placeholder="粘贴链接（可选）" />
          </div>
          <div class="todo-create-preview" aria-live="polite" hidden></div>
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
  const ballTimerToggle = root.querySelector(".todo-ball-timer-toggle");
  const ballTimerValue = root.querySelector(".todo-ball-timer-value");
  const ballTimerIcon = root.querySelector(".todo-ball-timer-icon");
  const panelCount = root.querySelector(".todo-panel-count");
  const panel = root.querySelector(".todo-panel");
  const headerSettings = root.querySelector(".todo-header-settings");
  const createForm = root.querySelector(".todo-create-form");
  const createInput = root.querySelector(".todo-create-input");
  const createLinkInput = root.querySelector(".todo-create-link-input");
  const createPreview = root.querySelector(".todo-create-preview");
  const list = root.querySelector(".todo-list");
  const toast = root.querySelector(".todo-toast");
  shell.dataset.todoEdge = "right";

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
  ballTimerToggle.addEventListener("click", handleBallTimerToggle);
  ballTimerToggle.addEventListener("pointerdown", (event) => event.stopPropagation());
  headerSettings.addEventListener("click", openOptionsPage);
  createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runSafely(addTodo());
  });
  createInput.addEventListener("input", renderCreatePreview);
  createLinkInput.addEventListener("input", renderCreatePreview);
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  list.addEventListener("click", handleListClick);
  list.addEventListener("change", handleListChange);
  list.addEventListener("keydown", handleListKeydown);
  list.addEventListener("blur", handleListBlur, true);
  list.addEventListener("dragstart", handleTodoDragStart);
  list.addEventListener("dragover", handleTodoDragOver);
  list.addEventListener("drop", handleTodoDrop);
  list.addEventListener("dragend", clearTodoDrag);
  toast.addEventListener("click", handleToastClick);
  window.addEventListener("resize", () => {
    persistClampedBallPosition();
    if (state.isOpen) positionPanel();
    if (!toast.hidden) positionToast();
  });
  window.addEventListener("pagehide", syncRunningTimerHeartbeat);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") syncRunningTimerHeartbeat();
  });
  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === "local" && (changes.todoUnfinishedItems || changes.todoSettings)) runSafely(refreshState());
  });
  chrome.runtime?.onMessage?.addListener((message) => {
    if (message?.type === MESSAGE_TYPES.REMINDER_DUE) showReminderToast(message.payload);
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
    applyBallThemeColor(state.settings.ballThemeColor);
    applyBallSize(state.settings.ballSize);
    const correctedPosition = applyBallPosition(state.settings.ballPosition);
    if (correctedPosition?.corrected) persistBallPosition(correctedPosition.position);
    render();
    syncTimerLoops();
  }

  function render() {
    const unfinishedCount = state.items.length;
    ballCount.textContent = String(unfinishedCount);
    ball.setAttribute("aria-label", `未完成待办 ${unfinishedCount} 项`);
    panelCount.textContent = String(unfinishedCount);
    panelCount.setAttribute("aria-label", `未完成待办 ${unfinishedCount} 项`);
    renderBallTimer();
    renderList();
    if (state.isOpen) positionPanel();
  }

  function renderList() {
    if (!state.items.length) {
      list.innerHTML = `<div class="todo-empty">No unfinished todos</div>`;
      return;
    }
    list.innerHTML = state.items.map((item) => {
      const colorPalette = state.activeColorId === item.id ? renderColorPalette(item) : "";
      const reminder = state.activeReminderId === item.id ? renderReminderPopover(item) : "";
      const todoMeta = renderTodoMeta(item);
      const reminderLabel = formatReminderLabel(item.reminderAt);
      const reminderClass = item.reminderAt ? " todo-action-reminder--set" : "";
      const reminderAria = item.reminderAt ? `修改提醒：${reminderLabel}` : "设置提醒";
      const timerState = getTimerState(item);
      const timerClass = timerState === "idle" ? "" : ` todo-item--timer-${timerState}`;
      const timerButtonClass = `todo-action-timer todo-action-timer--${timerState}`;
      const timerAria = timerActionLabel(timerState);
      const timerElapsed = timerState !== "idle"
        ? `<span class="todo-timer-elapsed" data-todo-id="${escapeAttribute(item.id)}">${escapeHtml(formatTimerClock(getTimerElapsedMs(item)))}</span>`
        : "";
      const timerIcon = timerState === "running" ? "pause" : timerState === "paused" ? "play" : "alarm-clock";
      return `
        <article class="todo-item${timerClass}" draggable="true" data-todo-id="${escapeAttribute(item.id)}" data-timer-state="${escapeAttribute(timerState)}" style="--todo-color:${escapeAttribute(item.color || "#ffffff")}">
          <div class="todo-item-main">
            <div class="todo-item-title-row">
              ${renderTodoTitle(item)}
            </div>
            <div class="todo-item-footer">
              <div class="todo-item-meta">
                <button class="todo-action-color" type="button" data-todo-id="${escapeAttribute(item.id)}" title="选择颜色" aria-label="选择颜色"><span class="todo-color-dot" aria-hidden="true"></span></button>
              ${todoMeta}
              </div>
              <div class="todo-item-actions">
                <button class="${timerButtonClass}" type="button" data-todo-id="${escapeAttribute(item.id)}" title="${escapeAttribute(timerAria)}" aria-label="${escapeAttribute(timerAria)}">${iconMarkup(timerIcon)}</button>
                ${timerElapsed}
                <button class="todo-action-reminder${reminderClass}" type="button" data-todo-id="${escapeAttribute(item.id)}" title="${escapeAttribute(reminderAria)}" aria-label="${escapeAttribute(reminderAria)}">${iconMarkup("bell")}</button>
                <button class="todo-action-complete" type="button" data-todo-id="${escapeAttribute(item.id)}" title="完成" aria-label="完成">${iconMarkup("check-circle")}</button>
                <button class="todo-action-delete" type="button" data-todo-id="${escapeAttribute(item.id)}" title="删除" aria-label="删除">${iconMarkup("trash-2")}</button>
              </div>
            </div>
          </div>
          ${colorPalette}
          ${reminder}
        </article>
      `;
    }).join("");
  }

  // 渲染任务第一行标题，有链接时生成新标签页打开的标题链接。
  function renderTodoTitle(item) {
    const parsedLink = parseTodoLink(item.text);
    if (parsedLink) {
      return `<a class="todo-title-link" href="${escapeAttribute(parsedLink.url)}" target="_blank" rel="noopener noreferrer" title="${escapeAttribute(parsedLink.label)}">${escapeHtml(parsedLink.label)}</a>`;
    }
    const text = String(item.text || "");
    return `<div class="todo-text" contenteditable="true" data-todo-id="${escapeAttribute(item.id)}" title="${escapeAttribute(text)}">${escapeHtml(text)}</div>`;
  }

  // 获取待办在标题提示里的展示名称，链接任务使用可读标题。
  function getTodoDisplayTitle(item) {
    const parsedLink = parseTodoLink(item?.text);
    return (parsedLink?.label || String(item?.text || "").trim() || "待办事项").trim();
  }

  // 解析任务文本中的链接写法，支持 Markdown 链接和纯 http/https 链接。
  function parseTodoLink(text) {
    const rawText = String(text || "").trim();
    const markdownMatch = rawText.match(/^\[([^\]\r\n]+)\]\((https?:\/\/[^\s<>"')]+)\)$/i);
    if (markdownMatch) {
      const label = markdownMatch[1].trim();
      const url = normalizeTodoUrl(markdownMatch[2]);
      if (label && url) return { label, url, source: "markdown" };
    }
    const directUrl = normalizeTodoUrl(rawText);
    if (directUrl) return { label: rawText, url: directUrl, source: "direct-url" };
    const inlineMatch = rawText.match(/^(.+?)\s+(https?:\/\/[^\s<>"']+)$/i);
    if (inlineMatch) {
      const label = inlineMatch[1].trim();
      const url = normalizeTodoUrl(inlineMatch[2]);
      if (label && url) return { label, url, source: "inline-title-url" };
    }
    return null;
  }

  // 校验链接只允许普通网页协议，避免把危险协议写进 href。
  function normalizeTodoUrl(url) {
    try {
      const parsed = new URL(String(url || "").trim());
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
    } catch {
      return "";
    }
  }

  // 组合任务标题和单独链接输入，继续复用存储中的 Markdown 链接格式。
  function formatTodoInputText(value, linkValue = "") {
    const rawText = String(value || "").trim();
    const explicitUrl = normalizeTodoUrl(linkValue);
    if (explicitUrl) return rawText ? `[${rawText}](${explicitUrl})` : explicitUrl;
    const parsedLink = parseTodoLink(rawText);
    if (parsedLink?.source !== "inline-title-url") return rawText;
    return `[${parsedLink.label}](${parsedLink.url})`;
  }

  // 渲染新增输入框下方的链接识别预览。
  function renderCreatePreview() {
    const rawTitle = createInput.value.trim();
    const explicitUrl = normalizeTodoUrl(createLinkInput.value);
    const parsedLink = explicitUrl
      ? { label: rawTitle || createLinkInput.value.trim(), url: explicitUrl, source: "link-input" }
      : parseTodoLink(createInput.value);
    if (!parsedLink || (parsedLink.source !== "inline-title-url" && parsedLink.source !== "link-input")) {
      createPreview.hidden = true;
      createPreview.innerHTML = "";
      return;
    }
    const host = formatLinkHost(parsedLink.url);
    createPreview.hidden = false;
    createPreview.innerHTML = `
      <span class="todo-create-preview-label">将显示为</span>
      <span class="todo-create-preview-title" title="${escapeAttribute(parsedLink.label)}">${escapeHtml(parsedLink.label)}</span>
      <span class="todo-create-preview-host">${escapeHtml(host)}</span>
    `;
  }

  // 提取链接预览里更适合快速扫读的域名。
  function formatLinkHost(url) {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  }

  // 渲染任务第二行左侧的加入时间和提醒时间。
  function renderTodoMeta(item) {
    const createdLabel = formatCreatedDisplay(item.createdAt || item.updatedAt);
    const reminderChip = renderReminderChip(item);
    return `
      ${createdLabel ? `<span class="todo-created-at">${escapeHtml(createdLabel)}</span>` : ""}
      ${createdLabel && reminderChip ? `<span class="todo-meta-separator" aria-hidden="true">·</span>` : ""}
      ${reminderChip}
    `;
  }

  function renderReminderChip(item) {
    const label = formatReminderLabel(item.reminderAt);
    if (!label) return "";
    return `<span class="todo-reminder-chip">${escapeHtml(`提醒 ${formatReminderDisplay(item.reminderAt)}`)}</span>`;
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
    const text = formatTodoInputText(createInput.value, createLinkInput.value);
    if (!text) return;
    const response = await sendMessage({ type: MESSAGE_TYPES.ADD_TODO, payload: { text } });
    if (!applyItemsResponse(response, "Unable to add todo")) return;
    createInput.value = "";
    createLinkInput.value = "";
    renderCreatePreview();
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

  // 切换指定任务的计时状态。
  async function toggleTodoTimer(todoId) {
    applyItemsResponse(await sendMessage({
      type: MESSAGE_TYPES.TOGGLE_TODO_TIMER,
      payload: { id: todoId, now: new Date().toISOString() }
    }), "Unable to toggle timer");
  }

  // 切换悬浮球当前关注任务的计时状态。
  async function toggleFocusedTodoTimer() {
    applyItemsResponse(await sendMessage({
      type: MESSAGE_TYPES.TOGGLE_FOCUSED_TODO_TIMER,
      payload: { now: new Date().toISOString() }
    }), "Unable to toggle timer");
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

  // 处理悬浮球内计时按钮的暂停与继续。
  function handleBallTimerToggle(event) {
    event.stopPropagation();
    runSafely(toggleFocusedTodoTimer());
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
    const timerButton = event.target.closest?.(".todo-action-timer");
    if (timerButton && list.contains(timerButton)) return runSafely(toggleTodoTimer(timerButton.dataset.todoId));
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
    if (!state.draggedTodoId) return;
    const item = event.target.closest?.(".todo-item");
    if (!item || !list.contains(item)) {
      if (list.contains(event.target)) {
        event.preventDefault();
        clearTodoDragMarkers();
      }
      return;
    }
    if (item.dataset.todoId === state.draggedTodoId) {
      clearTodoDragMarkers();
      return;
    }
    event.preventDefault();
    clearTodoDragMarkers();
    item.classList.add("todo-drag-over");
  }

  function handleTodoDrop(event) {
    const target = event.target.closest?.(".todo-item");
    const sourceId = state.draggedTodoId;
    clearTodoDrag();
    if (!sourceId) return;
    if (!target || !list.contains(target)) {
      if (list.contains(event.target)) moveTodoToEnd(sourceId, event);
      return;
    }
    if (target.dataset.todoId === sourceId) return;
    event.preventDefault();
    const rect = target.getBoundingClientRect();
    const position = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    moveTodo(sourceId, target.dataset.todoId, position);
  }

  function moveTodoToEnd(sourceId, event) {
    const target = state.items[state.items.length - 1];
    if (!target || target.id === sourceId) return;
    event.preventDefault();
    moveTodo(sourceId, target.id, "after");
  }

  function moveTodo(sourceId, targetId, position) {
    const sourceIndex = state.items.findIndex((item) => item.id === sourceId);
    const targetIndex = state.items.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = state.items.splice(sourceIndex, 1);
    const insertionIndex = state.items.findIndex((item) => item.id === targetId) + (position === "after" ? 1 : 0);
    state.items.splice(insertionIndex, 0, moved);
    state.reorderOperations.push({ sourceId, targetId, position });
    render();
  }

  function clearTodoDrag() {
    state.draggedTodoId = "";
    clearTodoDragMarkers();
  }

  function clearTodoDragMarkers() {
    for (const item of list.querySelectorAll?.(".todo-drag-over") || []) item.classList.remove("todo-drag-over");
  }

  function applyBallThemeColor(color) {
    root.style.setProperty("--todo-ball-theme", normalizeHexColor(color) || "#2563eb");
  }

  // 应用设置页保存的悬浮球尺寸。
  function applyBallSize(size) {
    shell.style.setProperty("--todo-ball-size", `${normalizeBallSize(size)}px`);
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
    const rect = shell.getBoundingClientRect();
    const rawLeft = state.ballDrag.left + event.clientX - state.ballDrag.startX;
    const side = getEdgeSide(null, rawLeft, rect);
    const left = getEdgeLeft(side, rect);
    const top = clamp(state.ballDrag.top + event.clientY - state.ballDrag.startY, 0, window.innerHeight - rect.height);
    state.ballDragMoved ||= Math.abs(event.clientX - state.ballDrag.startX) > 3 || Math.abs(event.clientY - state.ballDrag.startY) > 3;
    shell.style.left = `${left}px`;
    shell.style.top = `${top}px`;
    shell.style.right = "auto";
    shell.style.transform = "none";
    shell.dataset.todoEdge = side;
  }

  function finishBallDrag(event) {
    if (!state.ballDrag) return;
    ball.releasePointerCapture?.(event.pointerId);
    if (!state.ballDragMoved) {
      state.ballDrag = null;
      return;
    }
    const rect = shell.getBoundingClientRect();
    const side = getEdgeSide(null, rect.left, rect);
    const left = getEdgeLeft(side, rect);
    const top = clamp(rect.top, 0, Math.max(0, window.innerHeight - rect.height));
    const position = createRatioBallPosition(left, top, side, rect);
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
    const maxHeight = Math.max(0, Math.min(PANEL_HEIGHT, window.innerHeight - PANEL_VIEWPORT_MARGIN * 2));
    const rect = panel.getBoundingClientRect();
    const measuredHeight = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : maxHeight;
    return {
      width: Math.max(0, Math.min(PANEL_WIDTH, window.innerWidth - PANEL_VIEWPORT_MARGIN * 2)),
      height: Math.max(0, Math.min(measuredHeight, maxHeight))
    };
  }

  function applyBallPosition(position) {
    const rect = shell.getBoundingClientRect();
    const applied = resolveBallPosition(position, rect);
    if (!applied) return;
    state.ballPosition = applied.position;
    shell.dataset.todoEdge = applied.position.side;
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
    const savedSide = position.side === "left" || position.side === "right" ? position.side : null;
    const rawLeftRatio = Number(position.leftRatio);
    const rawTopRatio = Number(position.topRatio);
    if (Number.isFinite(rawLeftRatio) || Number.isFinite(rawTopRatio)) {
      const side = getEdgeSide(savedSide, clampRatio(rawLeftRatio) * maxLeft, rect);
      const leftRatio = side === "right" ? 1 : 0;
      const topRatio = clampRatio(rawTopRatio);
      const normalized = { leftRatio, topRatio, snapped: true, side };
      return {
        left: getEdgeLeft(side, rect),
        top: Math.round(topRatio * maxTop),
        corrected: leftRatio !== rawLeftRatio || topRatio !== rawTopRatio || position.snapped !== true || savedSide !== side,
        position: normalized
      };
    }
    const rawLeft = clamp(Number(position.left), 0, maxLeft);
    const side = getEdgeSide(savedSide, rawLeft, rect);
    const left = getEdgeLeft(side, rect);
    const top = clamp(Number(position.top), 0, maxTop);
    return {
      left,
      top,
      corrected: true,
      position: createRatioBallPosition(left, top, side, rect)
    };
  }

  function createRatioBallPosition(left, top, side, rect = shell.getBoundingClientRect()) {
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    const edgeSide = getEdgeSide(side, left, rect);
    return {
      leftRatio: edgeSide === "right" ? 1 : 0,
      topRatio: maxTop > 0 ? clamp(top, 0, maxTop) / maxTop : 0,
      snapped: true,
      side: edgeSide
    };
  }

  function getEdgeSide(side, left, rect) {
    if (side === "left" || side === "right") return side;
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    return clamp(left, 0, maxLeft) < maxLeft / 2 ? "left" : "right";
  }

  function getEdgeLeft(side, rect) {
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    return side === "right" ? maxLeft : 0;
  }

  function persistClampedBallPosition() {
    const applied = applyBallPosition(state.ballPosition);
    if (applied?.corrected) persistBallPosition(applied.position);
  }

  function persistBallPosition(position) {
    runSafely(sendMessage({ type: MESSAGE_TYPES.UPDATE_SETTINGS, payload: { ballPosition: position } }));
  }

  // 渲染悬浮球里的计时信息和数量徽标状态。
  function renderBallTimer() {
    const focusedTimer = getFocusedTimerItem();
    const activeTimers = getActiveTimerItems();
    const runningCount = activeTimers.filter((item) => item.timerState === "running").length;
    const hasTimer = Boolean(focusedTimer);
    ball.classList.toggle("todo-ball--timer-active", hasTimer);
    ball.classList.toggle("todo-ball--timer-paused", hasTimer && runningCount === 0);
    ballTimerToggle.hidden = !hasTimer;
    if (!focusedTimer) {
      delete ball.dataset.timerCount;
      ball.title = "待办";
      ball.style.setProperty("--todo-ball-progress", "0deg");
      ball.style.setProperty("--todo-ball-progress-color", "var(--todo-ball-theme)");
      return;
    }

    const progress = createTimerProgress(focusedTimer);
    const isRunning = runningCount > 0;
    const label = isRunning ? "暂停全部计时" : "继续全部计时";
    const timerTitle = getTodoDisplayTitle(focusedTimer);
    const timerTitlePrefix = getTimerState(focusedTimer) === "running" ? "正在进行" : "已暂停";
    const timerText = formatBallTimerClock(getTimerElapsedMs(focusedTimer));
    ball.dataset.timerCount = String(activeTimers.length);
    ball.title = `${timerTitlePrefix}：${timerTitle}`;
    ball.style.setProperty("--todo-ball-progress", `${progress.degrees}deg`);
    ball.style.setProperty("--todo-ball-progress-color", progress.color);
    ballTimerValue.textContent = timerText;
    ballTimerValue.setAttribute("title", timerText);
    ballTimerIcon.innerHTML = iconMarkup(isRunning ? "pause" : "play");
    ballTimerToggle.setAttribute("aria-label", label);
    ballTimerToggle.title = label;
  }

  // 根据是否存在运行中计时器启动或停止本页刷新循环。
  function syncTimerLoops() {
    const hasRunningTimer = state.items.some((item) => item.timerState === "running");
    if (hasRunningTimer && !state.timerRenderInterval && window.setInterval) {
      state.timerRenderInterval = window.setInterval(renderTimerTick, TIMER_RENDER_INTERVAL_MS);
    }
    if (!hasRunningTimer && state.timerRenderInterval && window.clearInterval) {
      window.clearInterval(state.timerRenderInterval);
      state.timerRenderInterval = 0;
    }

    if (hasRunningTimer && !state.timerHeartbeatInterval && window.setInterval) {
      state.timerHeartbeatInterval = window.setInterval(syncRunningTimerHeartbeat, TIMER_HEARTBEAT_INTERVAL_MS);
    }
    if (!hasRunningTimer && state.timerHeartbeatInterval && window.clearInterval) {
      window.clearInterval(state.timerHeartbeatInterval);
      state.timerHeartbeatInterval = 0;
    }
  }

  // 刷新当前页面上可见的计时文本。
  function renderTimerTick() {
    renderBallTimer();
    for (const timerText of list.querySelectorAll?.(".todo-timer-elapsed") || []) {
      const item = state.items.find((todo) => todo.id === timerText.dataset.todoId);
      if (item?.timerState === "running") timerText.textContent = formatTimerClock(getTimerElapsedMs(item));
    }
  }

  // 把运行中计时器的最后活跃时间写回后台。
  function syncRunningTimerHeartbeat() {
    if (!state.items.some((item) => item.timerState === "running")) return;
    runSafely(sendMessage({
      type: MESSAGE_TYPES.TOUCH_TODO_TIMER,
      payload: { now: new Date().toISOString() }
    }));
  }

  // 获取当前由悬浮球控制的计时任务。
  function getFocusedTimerItem() {
    return getActiveTimerItems()[0] || null;
  }

  // 获取所有已开始计时的任务，并按首次开始时间排序供浮球展示。
  function getActiveTimerItems() {
    return state.items
      .filter((item) => getTimerState(item) !== "idle")
      .slice()
      .sort((first, second) => timerFocusTime(first) - timerFocusTime(second));
  }

  // 计算半小时一圈的环形进度与当前进度色。
  function createTimerProgress(item) {
    const elapsedMs = getTimerElapsedMs(item);
    const cycleElapsed = elapsedMs % TIMER_PROGRESS_CYCLE_MS;
    const cycleProgress = elapsedMs > 0 && cycleElapsed === 0 ? 1 : cycleElapsed / TIMER_PROGRESS_CYCLE_MS;
    const themeColor = normalizeHexColor(state.settings.ballThemeColor) || "#2563eb";
    return {
      degrees: Math.round(cycleProgress * 360),
      color: mixHexColor("#ffffff", themeColor, 0.35 + cycleProgress * 0.45)
    };
  }

  // 生成活跃计时任务的排序时间，旧数据缺少首次开始时间时使用现有时间兜底。
  function timerFocusTime(item) {
    const value = Date.parse(item?.timerFirstStartedAt || item?.timerStartedAt || item?.timerLastTickAt || item?.updatedAt || item?.createdAt);
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  }

  // 按比例混合两个十六进制颜色，用于让主题色随进度逐步加深。
  function mixHexColor(fromColor, toColor, weight) {
    const from = hexToRgb(fromColor);
    const to = hexToRgb(toColor);
    const ratio = clamp(weight, 0, 1);
    return rgbToHex({
      r: Math.round(from.r * (1 - ratio) + to.r * ratio),
      g: Math.round(from.g * (1 - ratio) + to.g * ratio),
      b: Math.round(from.b * (1 - ratio) + to.b * ratio)
    });
  }

  // 把十六进制颜色拆成 RGB 通道。
  function hexToRgb(color) {
    const value = normalizeHexColor(color) || "#000000";
    return {
      r: Number.parseInt(value.slice(1, 3), 16),
      g: Number.parseInt(value.slice(3, 5), 16),
      b: Number.parseInt(value.slice(5, 7), 16)
    };
  }

  // 把 RGB 通道重新组合为十六进制颜色。
  function rgbToHex({ r, g, b }) {
    return `#${[r, g, b].map((value) => clamp(value, 0, 255).toString(16).padStart(2, "0")).join("")}`;
  }

  // 获取任务的计时展示状态。
  function getTimerState(item) {
    return item?.timerState === "running" || item?.timerState === "paused" ? item.timerState : "idle";
  }

  // 计算任务在当前时刻的累计计时时长。
  function getTimerElapsedMs(item, now = new Date()) {
    const elapsedMs = normalizeDurationMs(item?.timerElapsedMs);
    if (item?.timerState !== "running") return elapsedMs;
    const startedAt = Date.parse(item.timerStartedAt);
    const nowTime = now instanceof Date ? now.getTime() : Date.parse(now);
    if (!Number.isFinite(startedAt) || !Number.isFinite(nowTime)) return elapsedMs;
    return Math.max(0, Math.round(elapsedMs + nowTime - startedAt));
  }

  // 生成闹钟按钮当前状态下的可访问标签。
  function timerActionLabel(timerState) {
    if (timerState === "running") return "暂停计时";
    if (timerState === "paused") return "继续计时";
    return "开始计时";
  }

  // 将计时时长格式化为小球和列表中的时钟文本。
  function formatTimerClock(durationMs) {
    const totalSeconds = Math.max(0, Math.floor(normalizeDurationMs(durationMs) / 1000));
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return `${totalMinutes}:${String(seconds).padStart(2, "0")}`;
  }

  // 标准化计时毫秒值。
  // 将小球计时压缩成短文本，避免小尺寸悬浮球出现省略号截断。
  function formatBallTimerClock(durationMs) {
    const totalSeconds = Math.max(0, Math.floor(normalizeDurationMs(durationMs) / 1000));
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);
    if (hours >= 100) return `${hours}h`;
    if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`;
    return `${totalMinutes}:${String(seconds).padStart(2, "0")}`;
  }

  function normalizeDurationMs(value) {
    const durationMs = Number(value);
    return Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : 0;
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
    toast.innerHTML = "";
    toast.textContent = String(message || "Operation failed");
    toast.classList.toggle("todo-toast--reminder", false);
    toast.hidden = false;
    positionToast();
    window.clearTimeout?.(showToast.timer);
    showToast.timer = window.setTimeout?.(() => { toast.hidden = true; }, 4000);
  }

  function showReminderToast(payload) {
    const text = String(payload?.text || "待办事项").trim() || "待办事项";
    toast.textContent = "";
    toast.innerHTML = `
      <span class="todo-toast-message">${escapeHtml(`提醒：${text}`)}</span>
      <button class="todo-toast-ack" type="button">我知道了</button>
    `;
    toast.classList.toggle("todo-toast--reminder", true);
    toast.hidden = false;
    positionToast();
    window.clearTimeout?.(showToast.timer);
    showToast.timer = null;
  }

  function handleToastClick(event) {
    const ackButton = event.target?.closest?.(".todo-toast-ack");
    if (!ackButton || !toast.contains(ackButton)) return;
    toast.hidden = true;
    toast.innerHTML = "";
    toast.textContent = "";
    toast.classList.toggle("todo-toast--reminder", false);
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

  function formatReminderLabel(value) {
    const localValue = toDateTimeLocal(value);
    if (!localValue) return "";
    return `${localValue.slice(5, 7)}/${localValue.slice(8, 10)} ${localValue.slice(11, 16)}`;
  }

  function formatReminderDisplay(value) {
    const localValue = toDateTimeLocal(value);
    if (!localValue) return "";
    const today = toDateTimeLocal(new Date().toISOString()).slice(0, 10);
    const date = localValue.slice(0, 10);
    const time = localValue.slice(11, 16);
    return date === today ? `今天 ${time}` : `${localValue.slice(5, 7)}/${localValue.slice(8, 10)} ${time}`;
  }

  // 格式化任务加入时间，今天只显示时分，昨天显示相对日期。
  function formatCreatedDisplay(value) {
    const localValue = toDateTimeLocal(value);
    if (!localValue) return "";
    const today = toDateTimeLocal(new Date().toISOString()).slice(0, 10);
    const yesterday = shiftLocalDate(today, -1);
    const date = localValue.slice(0, 10);
    const time = localValue.slice(11, 16);
    if (date === today) return `加入 ${time}`;
    if (date === yesterday) return `加入 昨天 ${time}`;
    return `加入 ${localValue.slice(5, 7)}/${localValue.slice(8, 10)} ${time}`;
  }

  // 按天偏移 yyyy-mm-dd 字符串，供相对日期展示使用。
  function shiftLocalDate(dateText, offsetDays) {
    const date = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    date.setDate(date.getDate() + offsetDays);
    return toDateTimeLocal(date.toISOString()).slice(0, 10);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function normalizeHexColor(value) {
    return /^#[0-9a-fA-F]{6}$/.test(value || "") ? value.toLowerCase() : "";
  }

  // 标准化悬浮球尺寸，避免异常设置撑破页面。
  function normalizeBallSize(value) {
    const size = Number(value);
    if (!Number.isFinite(size)) return BALL_SIZE_DEFAULT;
    return Math.round(Math.min(Math.max(size, BALL_SIZE_MIN), BALL_SIZE_MAX));
  }
})();
