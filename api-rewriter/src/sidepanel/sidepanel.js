import {
  INTERCEPT_STAGES,
  MAX_BODY_BYTES,
  PANEL_MESSAGE_TYPES,
  PORT_NAME,
  WORKER_MESSAGE_TYPES
} from "../shared/constants.js";
import {
  buildManualKey,
  buildRuleGroupKey,
  createEmptyData,
  createInterfaceFilter,
  createRequestTemplate,
  createRule,
  diffJson,
  formatJson,
  getLatestRequestIds,
  getUtf8ByteLength,
  isInterfaceFiltered,
  parseJsonText
} from "../shared/domain.js";
import {
  exportDataFile,
  mutateStoredData,
  pickImportDataFile,
  readStoredData,
  replaceStoredData
} from "../shared/data-store.js";

const elements = {
  reconnectButton: document.getElementById("reconnectButton"),
  statusMessage: document.getElementById("statusMessage"),
  storageBar: document.getElementById("storageBar"),
  recordingControl: document.getElementById("recordingControl"),
  recordingDot: document.getElementById("recordingDot"),
  recordingTitle: document.getElementById("recordingTitle"),
  recordingDescription: document.getElementById("recordingDescription"),
  recordingToggle: document.getElementById("recordingToggle"),
  mainTabs: document.getElementById("mainTabs"),
  liveTab: document.getElementById("liveTab"),
  savedTab: document.getElementById("savedTab"),
  savedCount: document.getElementById("savedCount"),
  liveView: document.getElementById("liveView"),
  savedView: document.getElementById("savedView"),
  editorView: document.getElementById("editorView"),
  pendingBanner: document.getElementById("pendingBanner"),
  pendingBannerTitle: document.getElementById("pendingBannerTitle"),
  pendingBannerMeta: document.getElementById("pendingBannerMeta"),
  openPendingButton: document.getElementById("openPendingButton"),
  liveSearch: document.getElementById("liveSearch"),
  clearRequestsButton: document.getElementById("clearRequestsButton"),
  liveEmpty: document.getElementById("liveEmpty"),
  liveEmptyTitle: document.getElementById("liveEmptyTitle"),
  liveEmptyDescription: document.getElementById("liveEmptyDescription"),
  startRecordingButton: document.getElementById("startRecordingButton"),
  requestList: document.getElementById("requestList"),
  savedContent: document.getElementById("savedContent"),
  rulesSubtab: document.getElementById("rulesSubtab"),
  templatesSubtab: document.getElementById("templatesSubtab"),
  filtersSubtab: document.getElementById("filtersSubtab"),
  ruleCount: document.getElementById("ruleCount"),
  templateCount: document.getElementById("templateCount"),
  filterCount: document.getElementById("filterCount"),
  savedSearch: document.getElementById("savedSearch"),
  savedEmpty: document.getElementById("savedEmpty"),
  savedList: document.getElementById("savedList"),
  editorBackButton: document.getElementById("editorBackButton"),
  editorHeading: document.getElementById("editorHeading"),
  editorStage: document.getElementById("editorStage"),
  queueBadge: document.getElementById("queueBadge"),
  templateTools: document.getElementById("templateTools"),
  templateSelect: document.getElementById("templateSelect"),
  applyTemplateButton: document.getElementById("applyTemplateButton"),
  saveTemplateButton: document.getElementById("saveTemplateButton"),
  editorMethod: document.getElementById("editorMethod"),
  editorUrl: document.getElementById("editorUrl"),
  autoRuleNote: document.getElementById("autoRuleNote"),
  editorBodyLabel: document.getElementById("editorBodyLabel"),
  formatJsonButton: document.getElementById("formatJsonButton"),
  jsonEditor: document.getElementById("jsonEditor"),
  editorError: document.getElementById("editorError"),
  editorActions: document.getElementById("editorActions"),
  passOriginalButton: document.getElementById("passOriginalButton"),
  saveRuleButton: document.getElementById("saveRuleButton"),
  applyAndContinueButton: document.getElementById("applyAndContinueButton"),
  titleDialog: document.getElementById("titleDialog"),
  titleForm: document.getElementById("titleForm"),
  titleDialogEyebrow: document.getElementById("titleDialogEyebrow"),
  titleDialogHeading: document.getElementById("titleDialogHeading"),
  titleInput: document.getElementById("titleInput"),
  titleDialogHelp: document.getElementById("titleDialogHelp"),
  titleDialogError: document.getElementById("titleDialogError"),
  cancelTitleButton: document.getElementById("cancelTitleButton"),
  confirmDialog: document.getElementById("confirmDialog"),
  confirmForm: document.getElementById("confirmForm"),
  confirmDialogHeading: document.getElementById("confirmDialogHeading"),
  confirmDialogMessage: document.getElementById("confirmDialogMessage"),
  confirmSubmitButton: document.getElementById("confirmSubmitButton"),
  cancelConfirmButton: document.getElementById("cancelConfirmButton")
};

const state = {
  port: null,
  data: createEmptyData(),
  storageReady: false,
  storageError: "",
  session: createDisconnectedSession(),
  view: "live",
  savedKind: "rules",
  liveQuery: "",
  savedQuery: "",
  editorText: "",
  editorPendingId: "",
  resolvingPendingId: "",
  recordingChanging: false,
  lastPendingIdSeen: "",
  inspectedChange: null,
  flashMessage: "",
  flashType: "",
  titleAction: null,
  confirmAction: null,
  lastDialogTrigger: null
};

bindEvents();
void initialize();

// 连接后台、恢复本地文件并附加当前活动标签页。
async function initialize() {
  connectWorker();
  await refreshStoredData();
  await attachCurrentTab();
  render();
}

// 绑定侧栏中所有固定控件的交互事件。
function bindEvents() {
  elements.reconnectButton.addEventListener("click", () => updateRecording(true));
  elements.recordingToggle.addEventListener("change", () => updateRecording(elements.recordingToggle.checked));
  elements.startRecordingButton.addEventListener("click", () => updateRecording(true));
  elements.liveTab.addEventListener("click", () => setView("live"));
  elements.savedTab.addEventListener("click", () => setView("saved"));
  elements.rulesSubtab.addEventListener("click", () => setSavedKind("rules"));
  elements.templatesSubtab.addEventListener("click", () => setSavedKind("templates"));
  elements.filtersSubtab.addEventListener("click", () => setSavedKind("filters"));
  elements.liveSearch.addEventListener("input", () => {
    state.liveQuery = elements.liveSearch.value;
    renderLiveRequests();
  });
  elements.savedSearch.addEventListener("input", () => {
    state.savedQuery = elements.savedSearch.value;
    renderSavedList();
  });
  elements.clearRequestsButton.addEventListener("click", () => postWorkerMessage({ type: PANEL_MESSAGE_TYPES.CLEAR_REQUESTS }));
  elements.openPendingButton.addEventListener("click", openCurrentPending);
  elements.editorBackButton.addEventListener("click", () => setView("live"));
  elements.jsonEditor.addEventListener("input", () => {
    state.editorText = elements.jsonEditor.value;
    validateEditor();
  });
  elements.formatJsonButton.addEventListener("click", formatEditorText);
  elements.passOriginalButton.addEventListener("click", () => resolveCurrentPending("original"));
  elements.applyAndContinueButton.addEventListener("click", () => resolveCurrentPending("edited"));
  elements.saveRuleButton.addEventListener("click", (event) => openSaveRuleDialog(event.currentTarget));
  elements.saveTemplateButton.addEventListener("click", (event) => openSaveTemplateDialog(event.currentTarget));
  elements.applyTemplateButton.addEventListener("click", applySelectedTemplate);
  elements.titleForm.addEventListener("submit", handleTitleSubmit);
  elements.cancelTitleButton.addEventListener("click", closeTitleDialog);
  elements.confirmForm.addEventListener("submit", handleConfirmSubmit);
  elements.cancelConfirmButton.addEventListener("click", closeConfirmDialog);
  elements.titleDialog.addEventListener("close", restoreDialogFocus);
  elements.confirmDialog.addEventListener("close", restoreDialogFocus);
  elements.mainTabs.addEventListener("keydown", handleMainTabKeydown);
  chrome.tabs.onActivated.addListener(() => void attachCurrentTab());
}

// 使用方向键、Home 和 End 在主 Tab 之间移动并激活选项。
function handleMainTabKeydown(event) {
  const tabs = [elements.liveTab, elements.savedTab];
  const currentIndex = tabs.indexOf(document.activeElement);
  if (currentIndex < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? tabs.length - 1
      : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}

// 建立 Side Panel 与后台 Service Worker 的长连接。
function connectWorker() {
  state.port = chrome.runtime.connect({ name: PORT_NAME });
  state.port.onMessage.addListener((message) => {
    if (message?.type === WORKER_MESSAGE_TYPES.STATE) handleWorkerState(message.state);
    else if (message?.type === WORKER_MESSAGE_TYPES.APPLIED_CHANGE) handleAppliedChange(message.change);
  });
  state.port.onDisconnect.addListener(() => {
    state.port = null;
    state.inspectedChange = null;
    state.view = "live";
    state.session = {
      ...createDisconnectedSession(),
      error: chrome.runtime.lastError?.message || "后台连接已断开"
    };
    render();
  });
}

// 查询当前活动标签页并要求后台建立新的 CDP 会话。
async function attachCurrentTab() {
  if (!state.port) connectWorker();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) {
    state.session = { ...createDisconnectedSession(), error: "没有可连接的活动标签页" };
    render();
    return;
  }
  postWorkerMessage({ type: PANEL_MESSAGE_TYPES.ATTACH_TAB, tabId: tab.id });
  syncDataToWorker();
}

// 接收后台状态，并在出现新的等待项时打开 JSON 编辑器。
function handleWorkerState(nextSession) {
  const previousPendingId = state.session.currentPending?.id || "";
  state.session = { ...createDisconnectedSession(), ...(nextSession || {}) };
  state.recordingChanging = false;
  const currentPending = state.session.currentPending;
  if (!currentPending || currentPending.id !== state.resolvingPendingId || state.session.error) {
    state.resolvingPendingId = "";
  }
  if (currentPending && currentPending.id !== previousPendingId && currentPending.id !== state.lastPendingIdSeen) {
    state.inspectedChange = null;
    state.editorPendingId = currentPending.id;
    state.lastPendingIdSeen = currentPending.id;
    state.editorText = currentPending.currentText;
    state.view = "editor";
    queueMicrotask(() => elements.jsonEditor.focus());
  }
  if (!currentPending && state.view === "editor") {
    state.editorPendingId = "";
    state.editorText = "";
    state.view = "live";
  }
  if (state.view === "applied" && state.inspectedChange) {
    const live = state.session.requests.find((request) => request.id === state.inspectedChange.requestId);
    if (!live?.appliedStages?.includes(state.inspectedChange.stage)) {
      state.inspectedChange = null;
      state.view = "live";
    }
  }
  render();
}

// 打开后台返回的会话内已应用 Body，并切换到只读查看视图。
function handleAppliedChange(change) {
  if (!change?.requestId || !change?.stage) return;
  state.inspectedChange = change;
  state.editorText = change.text;
  state.view = "applied";
  render();
  elements.jsonEditor.focus();
}

// 从浏览器本地存储读取最新规则与模板，并同步到后台内存。
async function refreshStoredData() {
  const result = await readStoredData();
  if (result.ok) {
    state.data = result.data;
    state.storageReady = true;
    state.storageError = "";
  } else {
    state.data = createEmptyData();
    state.storageReady = false;
    state.storageError = result.message;
  }
  syncDataToWorker();
  render();
}

// 将当前规范化数据快照发送给后台拦截会话。
function syncDataToWorker() {
  postWorkerMessage({ type: PANEL_MESSAGE_TYPES.SYNC_DATA, data: state.data });
}

// 切换当前标签页的接口记录、手动拦截和自动规则总开关。
function updateRecording(enabled) {
  if (state.recordingChanging || !state.session.tabId) return;
  state.recordingChanging = true;
  postWorkerMessage({ type: PANEL_MESSAGE_TYPES.SET_RECORDING, enabled });
  renderRecordingControl();
  renderLiveRequests();
}

// 读取用户选择的 JSON 文件，并在确认后覆盖浏览器本地数据。
async function handleImportData(event) {
  const trigger = event.currentTarget;
  const result = await pickImportDataFile();
  if (!result.ok) {
    if (result.reason !== "picker_cancelled") showFlash(result.message, "error");
    return;
  }
  const currentCount = state.data.rules.length + state.data.requestTemplates.length + state.data.interfaceFilters.length;
  const importedCount = result.data.rules.length + result.data.requestTemplates.length + result.data.interfaceFilters.length;
  openConfirmDialog({
    trigger,
    heading: "导入 JSON",
    message: `将用“${result.fileName}”中的 ${importedCount} 条内容覆盖浏览器内已有的 ${currentCount} 条内容。`,
    confirmText: "覆盖并导入",
    confirmClassName: "button button-warning",
    action: async () => applyImportedData(result)
  });
}

// 将已确认的导入内容保存到浏览器，并立即同步给后台拦截会话。
async function applyImportedData(importResult) {
  const result = await replaceStoredData(importResult.data);
  if (!result.ok) {
    state.storageError = result.message;
    showFlash(result.message, "error");
    render();
    return false;
  }
  state.data = result.data;
  state.storageReady = true;
  state.storageError = "";
  syncDataToWorker();
  render();
  showFlash(`已从 ${importResult.fileName} 导入`, "success");
  return true;
}

// 将浏览器中保存的规则与请求体模板导出为 JSON 文件。
async function handleExportData() {
  if (!state.storageReady) {
    showFlash("浏览器本地数据暂不可用", "error");
    return;
  }
  const result = await exportDataFile(state.data);
  if (!result.ok) {
    if (result.reason !== "picker_cancelled") showFlash(result.message, "error");
    return;
  }
  showFlash(`已导出 ${result.fileName}`, "success");
}

// 在读取浏览器最新数据后执行一次持久化修改。
async function persistData(mutator, successMessage) {
  if (!state.storageReady) {
    showFlash("浏览器本地数据暂不可用", "error");
    return false;
  }
  const result = await mutateStoredData(mutator);
  if (!result.ok) {
    state.storageError = result.message;
    showFlash(result.message, "error");
    render();
    return false;
  }
  state.data = result.data;
  state.storageError = "";
  showFlash(successMessage, "success");
  syncDataToWorker();
  render();
  return true;
}

// 将实时请求的 Method 和完整 URL 加入持久接口过滤列表。
async function filterRequest(request) {
  if (isInterfaceFiltered(state.data.interfaceFilters, request.method, request.url)) return;
  const filter = createInterfaceFilter({ method: request.method, url: request.url });
  await persistData(
    (data) => ({ ...data, interfaceFilters: [...data.interfaceFilters, filter] }),
    "已过滤该接口"
  );
}

// 从持久接口过滤列表中移除指定过滤项。
async function removeInterfaceFilter(filter) {
  await persistData(
    (data) => ({
      ...data,
      interfaceFilters: data.interfaceFilters.filter((item) => item.id !== filter.id)
    }),
    "已取消接口过滤"
  );
}

// 将手动拦截开关变更发送给后台当前标签页会话。
function updateManualIntercept(request, stage, enabled) {
  postWorkerMessage({
    type: PANEL_MESSAGE_TYPES.SET_MANUAL_INTERCEPT,
    method: request.method,
    url: request.url,
    stage,
    enabled
  });
}

// 将命名规则的互斥启用状态发送给后台当前标签页会话。
function updateActiveRule(rule, enabled) {
  postWorkerMessage({
    type: PANEL_MESSAGE_TYPES.SET_ACTIVE_RULE,
    method: rule.method,
    url: rule.url,
    stage: rule.stage,
    ruleId: enabled ? rule.id : null
  });
}

// 根据用户选择原样放行或应用编辑后的 JSON。
function resolveCurrentPending(action) {
  const pending = state.session.currentPending;
  if (!pending || state.resolvingPendingId === pending.id) return;
  if (action === "edited" && !validateEditor()) return;
  state.resolvingPendingId = pending.id;
  renderEditor();
  postWorkerMessage({
    type: PANEL_MESSAGE_TYPES.RESOLVE_PENDING,
    pendingId: pending.id,
    action,
    text: action === "edited" ? state.editorText : ""
  });
}

// 将编辑器内容格式化为两空格缩进的 JSON。
function formatEditorText() {
  const parsed = parseJsonText(state.editorText);
  if (!parsed.ok) {
    validateEditor();
    return;
  }
  state.editorText = formatJson(parsed.value);
  elements.jsonEditor.value = state.editorText;
  validateEditor();
}

// 校验编辑器 JSON 并同步按钮和无障碍错误状态。
function validateEditor() {
  const parsed = parseJsonText(state.editorText);
  const resolving = state.resolvingPendingId === state.session.currentPending?.id;
  const oversized = parsed.ok && getUtf8ByteLength(JSON.stringify(parsed.value)) > MAX_BODY_BYTES;
  const valid = parsed.ok && !oversized;
  const location = parsed.ok || !parsed.line ? "" : `（第 ${parsed.line} 行，第 ${parsed.column} 列）`;
  elements.editorError.textContent = !parsed.ok
    ? `${parsed.error}${location}`
    : oversized
      ? "JSON Body 超过 5 MB，不能应用或保存"
      : "";
  elements.jsonEditor.setAttribute("aria-invalid", valid ? "false" : "true");
  elements.passOriginalButton.disabled = resolving;
  elements.applyAndContinueButton.disabled = !valid || resolving;
  elements.saveRuleButton.disabled = !valid || !state.storageReady;
  elements.saveTemplateButton.disabled = !valid || !state.storageReady;
  return valid;
}

// 打开保存字段差异规则的标题对话框。
function openSaveRuleDialog(trigger) {
  const pending = state.session.currentPending;
  if (!pending || !state.storageReady) return;
  const original = parseJsonText(pending.originalText);
  const current = parseJsonText(state.editorText);
  if (!original.ok || !current.ok) {
    validateEditor();
    return;
  }
  const patches = diffJson(original.value, current.value);
  if (!patches.length) {
    elements.editorError.textContent = "当前 JSON 与原始值相同，没有可保存的字段变化";
    return;
  }

  openTitleDialog({
    trigger,
    eyebrow: "保存替换规则",
    heading: pending.stage === INTERCEPT_STAGES.REQUEST ? "命名请求替换规则" : "命名响应替换规则",
    value: defaultSavedTitle(pending, pending.stage === INTERCEPT_STAGES.REQUEST ? "请求" : "响应"),
    help: `将保存 ${patches.length} 个字段操作，精确匹配 ${pending.method} ${pending.url}`,
    action: async (title) => {
      const rule = createRule({
        title,
        method: pending.method,
        url: pending.url,
        stage: pending.stage,
        patches
      });
      return persistData((data) => ({ ...data, rules: [...data.rules, rule] }), "替换规则已保存");
    }
  });
}

// 打开保存完整请求体模板的标题对话框。
function openSaveTemplateDialog(trigger) {
  const pending = state.session.currentPending;
  if (!pending || pending.stage !== INTERCEPT_STAGES.REQUEST || !state.storageReady) return;
  const parsed = parseJsonText(state.editorText);
  if (!parsed.ok) {
    validateEditor();
    return;
  }
  openTitleDialog({
    trigger,
    eyebrow: "快捷保存请求体",
    heading: "命名请求体模板",
    value: defaultSavedTitle(pending, "请求体模板"),
    help: `保存完整 Body，仅用于 ${pending.method} ${pending.url}`,
    action: async (title) => {
      const template = createRequestTemplate({
        title,
        method: pending.method,
        url: pending.url,
        body: parsed.value
      });
      return persistData(
        (data) => ({ ...data, requestTemplates: [...data.requestTemplates, template] }),
        "请求体模板已保存"
      );
    }
  });
}

// 将下拉框选中的请求体模板填入当前编辑器。
function applySelectedTemplate() {
  const pending = state.session.currentPending;
  const template = state.data.requestTemplates.find((item) => item.id === elements.templateSelect.value);
  if (!pending || !template || template.method !== pending.method || template.url !== pending.url) return;
  if (getUtf8ByteLength(JSON.stringify(template.body)) > MAX_BODY_BYTES) {
    showFlash("该请求体模板超过 5 MB，不能套用", "error");
    return;
  }
  state.editorText = formatJson(template.body);
  elements.jsonEditor.value = state.editorText;
  validateEditor();
  showFlash(`已套用模板：${template.title}`, "success");
}

// 打开重命名规则或模板的对话框。
function openRenameDialog(kind, item, trigger) {
  const noun = kind === "rules" ? "替换规则" : "请求体模板";
  openTitleDialog({
    trigger,
    eyebrow: `重命名${noun}`,
    heading: item.title,
    value: item.title,
    help: `${item.method} ${item.url}`,
    action: async (title) => persistData((data) => ({
      ...data,
      rules: kind === "rules"
        ? data.rules.map((rule) => rule.id === item.id ? { ...rule, title, updatedAt: new Date().toISOString() } : rule)
        : data.rules,
      requestTemplates: kind === "templates"
        ? data.requestTemplates.map((template) => template.id === item.id
          ? { ...template, title, updatedAt: new Date().toISOString() }
          : template)
        : data.requestTemplates
    }), `${noun}已重命名`)
  });
}

// 打开删除规则或模板的确认对话框。
function openDeleteDialog(kind, item, trigger) {
  const noun = kind === "rules" ? "替换规则" : "请求体模板";
  openConfirmDialog({
    trigger,
    heading: "确认删除",
    message: `确定删除“${item.title}”吗？这会立即更新浏览器本地数据。`,
    confirmText: "删除",
    confirmClassName: "button button-danger",
    action: async () => persistData((data) => ({
      ...data,
      rules: kind === "rules" ? data.rules.filter((rule) => rule.id !== item.id) : data.rules,
      requestTemplates: kind === "templates"
        ? data.requestTemplates.filter((template) => template.id !== item.id)
        : data.requestTemplates
    }), `${noun}已删除`)
  });
}

// 配置并打开用于输入自定义标题的原生对话框。
function openTitleDialog({ trigger, eyebrow, heading, value, help, action }) {
  state.lastDialogTrigger = trigger;
  state.titleAction = action;
  elements.titleDialogEyebrow.textContent = eyebrow;
  elements.titleDialogHeading.textContent = heading;
  elements.titleInput.value = value;
  elements.titleDialogHelp.textContent = help;
  elements.titleDialogError.textContent = "";
  elements.titleInput.setAttribute("aria-invalid", "false");
  elements.titleDialog.showModal();
  elements.titleInput.focus();
  elements.titleInput.select();
}

// 校验标题并执行当前保存或重命名操作。
async function handleTitleSubmit(event) {
  event.preventDefault();
  const title = elements.titleInput.value.trim();
  if (!title) {
    elements.titleDialogError.textContent = "请输入标题";
    elements.titleInput.setAttribute("aria-invalid", "true");
    elements.titleInput.focus();
    return;
  }
  const ok = await state.titleAction?.(title);
  if (ok) closeTitleDialog();
}

// 关闭标题输入对话框并清理待执行操作。
function closeTitleDialog() {
  state.titleAction = null;
  elements.titleDialog.close();
}

// 配置并打开导入或删除操作使用的确认对话框。
function openConfirmDialog({ trigger, heading, message, confirmText, confirmClassName, action }) {
  state.lastDialogTrigger = trigger;
  state.confirmAction = action;
  elements.confirmDialogHeading.textContent = heading;
  elements.confirmDialogMessage.textContent = message;
  elements.confirmSubmitButton.textContent = confirmText;
  elements.confirmSubmitButton.className = confirmClassName;
  elements.confirmDialog.showModal();
  elements.cancelConfirmButton.focus();
}

// 执行确认对话框当前绑定的删除操作。
async function handleConfirmSubmit(event) {
  event.preventDefault();
  const ok = await state.confirmAction?.();
  if (ok) closeConfirmDialog();
}

// 关闭删除确认对话框并清理待执行操作。
function closeConfirmDialog() {
  state.confirmAction = null;
  elements.confirmDialog.close();
}

// 在原生对话框关闭后将焦点还给触发按钮。
function restoreDialogFocus() {
  state.lastDialogTrigger?.focus?.();
  state.lastDialogTrigger = null;
}

// 切换实时请求、已保存、等待项编辑或本次修改查看视图。
function setView(view) {
  if (view !== "applied") state.inspectedChange = null;
  state.view = view;
  render();
}

// 切换已保存页面中的规则、请求体模板和接口过滤列表。
function setSavedKind(kind) {
  state.savedKind = kind;
  renderSavedList();
  renderTabs();
}

// 打开当前 FIFO 队首等待项的编辑器。
function openCurrentPending() {
  const pending = state.session.currentPending;
  if (!pending) return;
  if (state.editorPendingId !== pending.id) {
    state.editorPendingId = pending.id;
    state.editorText = pending.currentText;
  }
  state.inspectedChange = null;
  state.view = "editor";
  render();
  elements.jsonEditor.focus();
}

// 渲染当前 Side Panel 的所有可见区域。
function render() {
  renderStatus();
  renderStorageBar();
  renderRecordingControl();
  renderTabs();
  renderPendingBanner();
  renderLiveRequests();
  renderSavedList();
  if (state.view === "editor") renderEditor();
  else if (state.view === "applied") renderAppliedChange();
  renderVisibility();
}

// 渲染连接、文件和操作反馈的最高优先级状态。
function renderStatus() {
  const error = state.session.error || state.storageError || (state.flashType === "error" ? state.flashMessage : "");
  const success = !error && state.flashType === "success" ? state.flashMessage : "";
  const message = error || success || state.session.notice || "";
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = "status-message";
  if (error) elements.statusMessage.classList.add("is-error");
  else if (success || state.session.recording) elements.statusMessage.classList.add("is-success");
  elements.reconnectButton.hidden = !state.session.error || !state.session.tabId;
}

// 渲染浏览器本地存储状态以及 JSON 导入和导出入口。
function renderStorageBar() {
  elements.storageBar.replaceChildren();
  const summary = createElement("div", "file-summary");
  const dot = createElement("span", `file-dot${state.storageReady ? "" : " is-warning"}`);
  dot.setAttribute("aria-hidden", "true");
  const text = createElement("div");
  text.append(
    createElement("div", "file-name", "浏览器本地存储"),
    createElement("div", "file-hint", state.storageReady ? "自动保存，无需文件授权" : "本地存储暂不可用")
  );
  summary.append(dot, text);
  const importButton = createButton("导入 JSON", "button button-secondary", handleImportData);
  const exportButton = createButton("导出 JSON", "button button-quiet", handleExportData);
  exportButton.disabled = !state.storageReady;
  elements.storageBar.append(summary, importButton, exportButton);
}

// 渲染默认关闭且不持久化的接口记录总开关。
function renderRecordingControl() {
  const recording = Boolean(state.session.recording);
  elements.recordingControl.classList.toggle("is-recording", recording);
  elements.recordingTitle.textContent = recording ? "正在记录接口" : "接口记录已停止";
  elements.recordingDescription.textContent = recording
    ? "正在记录、拦截并应用当前启用的自动规则。"
    : "开启后才会记录、拦截和应用自动规则。";
  elements.recordingToggle.checked = recording;
  elements.recordingToggle.disabled = state.recordingChanging || !state.session.tabId;
  elements.recordingToggle.setAttribute("aria-label", recording ? "停止接口记录" : "开启接口记录");
}

// 渲染主 Tab 和已保存内容子 Tab 的选中状态与数量。
function renderTabs() {
  const liveActive = state.view === "live";
  const savedActive = state.view === "saved";
  setTabState(elements.liveTab, liveActive);
  setTabState(elements.savedTab, savedActive);
  setTabState(elements.rulesSubtab, state.savedKind === "rules");
  setTabState(elements.templatesSubtab, state.savedKind === "templates");
  setTabState(elements.filtersSubtab, state.savedKind === "filters");
  elements.savedCount.textContent = String(
    state.data.rules.length + state.data.requestTemplates.length + state.data.interfaceFilters.length
  );
  elements.ruleCount.textContent = String(state.data.rules.length);
  elements.templateCount.textContent = String(state.data.requestTemplates.length);
  elements.filterCount.textContent = String(state.data.interfaceFilters.length);
}

// 渲染当前等待队列的快捷入口。
function renderPendingBanner() {
  const pending = state.session.currentPending;
  elements.pendingBanner.hidden = !pending;
  if (!pending) return;
  elements.pendingBannerTitle.textContent = `${pending.method} ${getDisplayPath(pending.url)}`;
  elements.pendingBannerMeta.textContent = `${stageLabel(pending.stage)}等待处理 · 队列 ${state.session.pendingCount} 条`;
}

// 渲染实时 Fetch/XHR 请求和请求、响应独立开关。
function renderLiveRequests() {
  const query = state.liveQuery.trim().toLowerCase();
  const latestRequestIds = getLatestRequestIds(state.session.requests);
  const requests = state.session.requests.filter((request) => {
    const haystack = `${request.method} ${request.url}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  elements.requestList.replaceChildren(
    ...requests.map((request) => renderRequestCard(request, latestRequestIds.has(request.id)))
  );
  elements.liveEmpty.hidden = requests.length > 0;
  elements.requestList.hidden = requests.length === 0;
  elements.clearRequestsButton.disabled = state.session.requests.length === 0;
  if (!requests.length) {
    const recording = Boolean(state.session.recording);
    elements.liveEmptyTitle.textContent = recording ? "等待 Fetch/XHR 请求" : "接口记录尚未开启";
    elements.liveEmptyDescription.textContent = recording
      ? "保持 Side Panel 打开，然后在当前页面触发接口。"
      : "开启后才会接收当前页面的 Fetch/XHR 请求。";
    elements.startRecordingButton.hidden = recording;
    elements.startRecordingButton.disabled = state.recordingChanging || !state.session.tabId;
  }
}

// 创建单条实时请求的语义化列表卡片，并标记它是否为同接口的最新记录。
function renderRequestCard(request, isLatestRequest) {
  const item = createElement("li", "request-card");
  const head = createElement("div", "request-head");
  head.append(
    createElement("span", "method-badge", request.method),
    createElement("span", "request-url", getDisplayPath(request.url))
  );
  if (request.statusCode) head.append(createElement("span", "stage-badge", String(request.statusCode)));

  const origin = createElement("p", "request-origin", request.url);
  const meta = createElement("div", "request-meta");
  meta.append(createElement("span", "", formatRelativeTime(request.createdAt)));
  const controls = createElement("div", "request-controls");
  const filterButton = createButton("过滤", "button button-quiet filter-button", () => void filterRequest(request));
  filterButton.disabled = !state.storageReady
    || isInterfaceFiltered(state.data.interfaceFilters, request.method, request.url);
  filterButton.title = `过滤 ${request.method} ${request.url}`;
  const switches = createElement("div", "switch-group");
  switches.append(
    createInterceptToggle(request, INTERCEPT_STAGES.REQUEST, "请求", !request.requestHasJson, isLatestRequest),
    createInterceptToggle(request, INTERCEPT_STAGES.RESPONSE, "响应", false, isLatestRequest)
  );
  controls.append(filterButton, switches);
  meta.append(controls);
  item.append(head, origin, meta);

  if (request.lastError || request.lastAction) {
    item.append(createElement(
      "p",
      `request-note${request.lastError ? " is-error" : ""}`,
      request.lastError || request.lastAction
    ));
  }
  if (request.appliedStages?.length) {
    const actions = createElement("div", "request-change-actions");
    for (const stage of request.appliedStages) {
      actions.append(createButton(
        `查看${stage === INTERCEPT_STAGES.REQUEST ? "请求" : "响应"}修改`,
        "text-button request-change-button",
        () => requestAppliedChange(request, stage)
      ));
    }
    item.append(actions);
  }
  return item;
}

// 请求后台按需返回指定实时请求在当前会话内保存的已应用 Body。
function requestAppliedChange(request, stage) {
  postWorkerMessage({
    type: PANEL_MESSAGE_TYPES.GET_APPLIED_CHANGE,
    requestId: request.id,
    stage
  });
}

// 创建实时请求中请求或响应方向的复选开关，旧记录仅保留禁用的未勾选状态。
function createInterceptToggle(request, stage, labelText, bodyUnavailable, isLatestRequest) {
  const label = createElement("label", "switch-label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = isLatestRequest
    && state.session.manualKeys.includes(buildManualKey(request.method, request.url, stage));
  input.disabled = !state.session.connected || bodyUnavailable || !isLatestRequest;
  input.addEventListener("change", () => updateManualIntercept(request, stage, input.checked));
  label.append(input, createElement("span", "", labelText));
  if (!isLatestRequest) label.title = "同一接口的开关以最近一条记录为准";
  else if (bodyUnavailable) label.title = "请求没有可编辑的 JSON Body";
  return label;
}

// 渲染规则或请求体模板的本地文件列表。
function renderSavedList() {
  const source = state.savedKind === "rules"
    ? state.data.rules
    : state.savedKind === "templates"
      ? state.data.requestTemplates
      : state.data.interfaceFilters;
  const query = state.savedQuery.trim().toLowerCase();
  const items = source.filter((item) => !query || `${item.title || ""} ${item.method} ${item.url}`.toLowerCase().includes(query));
  elements.savedList.replaceChildren(...items.map((item) => renderSavedCard(state.savedKind, item)));
  elements.savedEmpty.hidden = items.length > 0;
  elements.savedList.hidden = items.length === 0;
  if (!items.length) {
    elements.savedEmpty.replaceChildren(
      createElement("strong", "", query
        ? "没有匹配结果"
        : state.savedKind === "rules"
          ? "还没有替换规则"
          : state.savedKind === "templates"
            ? "还没有请求体模板"
            : "还没有接口过滤项"),
      createElement("p", "", query
        ? "尝试其他标题或 URL。"
        : state.savedKind === "filters"
          ? "在实时请求卡片中点击“过滤”后会出现在这里。"
          : "在等待项编辑器中保存后会出现在这里。")
    );
  }
}

// 创建单条持久规则、请求体模板或接口过滤卡片。
function renderSavedCard(kind, item) {
  if (kind === "filters") return renderFilterCard(item);
  const listItem = createElement("li", "saved-card");
  const head = createElement("div", "saved-head");
  head.append(createElement("span", "saved-title", item.title));
  if (kind === "rules") {
    const switchLabel = createElement("label", "switch-label");
    const input = document.createElement("input");
    const groupKey = buildRuleGroupKey(item.method, item.url, item.stage);
    input.type = "checkbox";
    input.checked = state.session.activeRuleIds[groupKey] === item.id;
    const filtered = isInterfaceFiltered(state.data.interfaceFilters, item.method, item.url);
    input.disabled = !state.session.connected || filtered;
    input.addEventListener("change", () => updateActiveRule(item, input.checked));
    switchLabel.append(input, createElement("span", "", "启用"));
    if (filtered) switchLabel.title = "该接口已过滤，取消过滤后可启用规则";
    head.append(switchLabel);
  } else {
    head.append(createElement("span", "stage-badge", "请求模板"));
  }

  const url = createElement("p", "saved-url", `${item.method} ${item.url}`);
  const meta = createElement("div", "saved-meta");
  if (kind === "rules") {
    meta.append(
      createElement("span", `stage-badge${item.stage === INTERCEPT_STAGES.RESPONSE ? " is-response" : ""}`, stageLabel(item.stage)),
      createElement("span", "", `${item.patches.length} 个字段操作`)
    );
  } else {
    meta.append(createElement("span", "", `${countTopLevelFields(item.body)} 个顶层字段`));
  }

  const actions = createElement("div", "saved-actions");
  const renameButton = createButton("重命名", "button button-quiet", (event) => openRenameDialog(kind, item, event.currentTarget));
  const deleteButton = createButton("删除", "button button-quiet", (event) => openDeleteDialog(kind, item, event.currentTarget));
  actions.append(renameButton, deleteButton);
  listItem.append(head, url, meta, actions);
  return listItem;
}

// 创建单条持久接口过滤卡片并提供取消过滤入口。
function renderFilterCard(filter) {
  const listItem = createElement("li", "saved-card is-filter");
  const head = createElement("div", "saved-head");
  head.append(
    createElement("span", "method-badge", filter.method),
    createElement("span", "saved-title", getDisplayPath(filter.url)),
    createElement("span", "stage-badge", "完全匹配")
  );
  const url = createElement("p", "saved-url", filter.url);
  const meta = createElement("div", "saved-meta");
  meta.append(createElement("span", "", `添加于 ${formatSavedTime(filter.createdAt)}`));
  const actions = createElement("div", "saved-actions");
  actions.append(createButton(
    "取消过滤",
    "button button-quiet",
    () => void removeInterfaceFilter(filter)
  ));
  listItem.append(head, url, meta, actions);
  return listItem;
}

// 渲染 FIFO 队首等待项的直接 JSON 编辑界面。
function renderEditor() {
  const pending = state.session.currentPending;
  if (!pending) return;
  elements.editorHeading.textContent = `${pending.method} ${getDisplayPath(pending.url)}`;
  elements.editorStage.textContent = `${stageLabel(pending.stage)}已暂停，等待处理`;
  elements.queueBadge.textContent = `队列 ${state.session.pendingCount}`;
  elements.queueBadge.hidden = false;
  elements.editorMethod.textContent = pending.method;
  elements.editorUrl.textContent = pending.url;
  elements.editorBodyLabel.textContent = pending.stage === INTERCEPT_STAGES.REQUEST ? "请求 Body" : "响应 Body";
  elements.autoRuleNote.hidden = !pending.activeRuleTitle;
  elements.autoRuleNote.textContent = pending.activeRuleTitle ? `已先应用自动规则：${pending.activeRuleTitle}` : "";
  elements.templateTools.hidden = pending.stage !== INTERCEPT_STAGES.REQUEST;
  elements.formatJsonButton.hidden = false;
  elements.editorActions.hidden = false;
  elements.jsonEditor.readOnly = false;
  elements.jsonEditor.setAttribute("aria-readonly", "false");

  if (elements.jsonEditor.value !== state.editorText) elements.jsonEditor.value = state.editorText;
  renderMatchingTemplates(pending);
  validateEditor();
}

// 渲染当前会话内已经成功应用的请求或响应 Body 只读详情。
function renderAppliedChange() {
  const change = state.inspectedChange;
  if (!change) return;
  elements.editorHeading.textContent = `${change.method} ${getDisplayPath(change.url)}`;
  elements.editorStage.textContent = `${stageLabel(change.stage)} · 已应用`;
  elements.queueBadge.textContent = "仅本次会话";
  elements.queueBadge.hidden = false;
  elements.editorMethod.textContent = change.method;
  elements.editorUrl.textContent = change.url;
  elements.editorBodyLabel.textContent = stageLabel(change.stage);
  elements.templateTools.hidden = true;
  elements.formatJsonButton.hidden = true;
  elements.editorActions.hidden = true;
  elements.autoRuleNote.hidden = false;
  const sourceText = change.source === "rule"
    ? `自动规则：${change.sourceTitle || "未命名规则"}`
    : change.sourceTitle
      ? `手动修改，已先应用规则：${change.sourceTitle}`
      : "手动修改";
  const payloadHint = change.stage === INTERCEPT_STAGES.REQUEST
    ? "实际请求已使用此 Body；DevTools 的“载荷”仍可能显示拦截前值。"
    : "页面实际收到的响应已使用此 Body。";
  elements.autoRuleNote.textContent = `${sourceText}。${payloadHint}`;
  if (elements.jsonEditor.value !== change.text) elements.jsonEditor.value = change.text;
  elements.jsonEditor.readOnly = true;
  elements.jsonEditor.setAttribute("aria-readonly", "true");
  elements.jsonEditor.setAttribute("aria-invalid", "false");
  elements.editorError.textContent = "";
}

// 渲染仅与当前 Method 和完整 URL 匹配的请求体模板。
function renderMatchingTemplates(pending) {
  const templates = state.data.requestTemplates.filter((template) => (
    template.method === pending.method && template.url === pending.url
  ));
  const previousValue = elements.templateSelect.value;
  elements.templateSelect.replaceChildren(createOption("", templates.length ? "选择当前接口的模板" : "当前接口暂无模板"));
  for (const template of templates) elements.templateSelect.append(createOption(template.id, template.title));
  elements.templateSelect.value = templates.some((template) => template.id === previousValue) ? previousValue : "";
  elements.templateSelect.disabled = templates.length === 0;
  elements.applyTemplateButton.disabled = !elements.templateSelect.value;
  elements.templateSelect.onchange = () => {
    elements.applyTemplateButton.disabled = !elements.templateSelect.value;
  };
}

// 根据当前视图状态控制三个主要区域的可见性和 Tab 语义。
function renderVisibility() {
  const detailVisible = state.view === "editor" || state.view === "applied";
  elements.mainTabs.hidden = detailVisible;
  elements.liveView.hidden = state.view !== "live";
  elements.savedView.hidden = state.view !== "saved";
  elements.editorView.hidden = !detailVisible;
}

// 设置一个 Tab 按钮的选中样式和 aria-selected。
function setTabState(tab, active) {
  tab.classList.toggle("is-active", active);
  if (tab.getAttribute("role") === "tab") {
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.tabIndex = active ? 0 : -1;
  } else {
    tab.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

// 创建便于后台断开时复用的空会话状态。
function createDisconnectedSession() {
  return {
    tabId: null,
    tabUrl: "",
    connected: false,
    recording: false,
    error: "",
    notice: "",
    pendingCount: 0,
    currentPending: null,
    requests: [],
    manualKeys: [],
    activeRuleIds: {}
  };
}

// 发送消息给后台，并在连接失效时显示错误。
function postWorkerMessage(message) {
  try {
    if (!state.port) throw new Error("后台连接不存在");
    state.port.postMessage(message);
  } catch {
    state.resolvingPendingId = "";
    state.recordingChanging = false;
    state.session.error = "后台连接已断开，请重新打开 Side Panel";
    render();
  }
}

// 在状态栏显示最近一次成功或失败提示。
function showFlash(message, type) {
  state.flashMessage = String(message || "");
  state.flashType = type;
  renderStatus();
}

// 为保存规则或模板生成可编辑的默认标题。
function defaultSavedTitle(pending, suffix) {
  return `${getDisplayPath(pending.url)} · ${suffix}`;
}

// 从完整 URL 中提取包含 Query 的路径供窄侧栏展示。
function getDisplayPath(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || parsed.href;
  } catch {
    return String(url || "");
  }
}

// 将请求或响应阶段转换为中文界面文案。
function stageLabel(stage) {
  return stage === INTERCEPT_STAGES.REQUEST ? "请求 Body" : "响应 Body";
}

// 将时间戳转换为实时请求列表中的相对时间。
function formatRelativeTime(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - Number(timestamp || Date.now())) / 1000));
  if (seconds < 5) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} 分钟前` : new Date(timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

// 将持久记录时间格式化为接口过滤列表中的简短日期时间。
function formatSavedTime(timestamp) {
  const date = new Date(timestamp || Date.now());
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// 统计请求体模板用于列表摘要的顶层字段数量。
function countTopLevelFields(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 1;
}

// 创建带文本和类名的 DOM 元素，避免使用不安全的 HTML 拼接。
function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== "") element.textContent = text;
  return element;
}

// 创建具有原生键盘语义的按钮元素。
function createButton(text, className, handler) {
  const button = createElement("button", className, text);
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}

// 创建请求体模板下拉框选项。
function createOption(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}
