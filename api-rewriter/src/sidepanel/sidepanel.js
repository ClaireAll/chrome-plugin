import {
  INTERCEPT_STAGES,
  MAX_BODY_BYTES,
  PANEL_MESSAGE_TYPES,
  PORT_NAME,
  WORKER_MESSAGE_TYPES
} from "../shared/constants.js";
import {
  buildInterfaceKey,
  buildManualKey,
  buildRuleGroupKey,
  createDefaultQuickConfig,
  createEmptyData,
  createInterfaceFilter,
  createRequestTemplate,
  createRule,
  diffJson,
  formatJson,
  getQuickConfigChanges,
  getLatestRequestIds,
  getUtf8ByteLength,
  isInterfaceFiltered,
  normalizeQuickConfig,
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
  statusMessageText: document.getElementById("statusMessageText"),
  dismissStatusButton: document.getElementById("dismissStatusButton"),
  storageBar: document.getElementById("storageBar"),
  recordingControl: document.getElementById("recordingControl"),
  recordingDot: document.getElementById("recordingDot"),
  recordingTitle: document.getElementById("recordingTitle"),
  recordingDescription: document.getElementById("recordingDescription"),
  recordingToggle: document.getElementById("recordingToggle"),
  mainTabs: document.getElementById("mainTabs"),
  liveTab: document.getElementById("liveTab"),
  savedTab: document.getElementById("savedTab"),
  quickTab: document.getElementById("quickTab"),
  savedCount: document.getElementById("savedCount"),
  liveView: document.getElementById("liveView"),
  savedView: document.getElementById("savedView"),
  quickView: document.getElementById("quickView"),
  quickForm: document.getElementById("quickForm"),
  quickCombination: document.getElementById("quickCombination"),
  quickIdentityOutcome: document.getElementById("quickIdentityOutcome"),
  resetQuickButton: document.getElementById("resetQuickButton"),
  applyQuickButton: document.getElementById("applyQuickButton"),
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
  statusDismissed: false,
  titleAction: null,
  confirmAction: null,
  lastDialogTrigger: null,
  quickDraftDirty: false,
  quickApplying: false
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
  elements.dismissStatusButton.addEventListener("click", dismissStatus);
  elements.recordingToggle.addEventListener("change", () => updateRecording(elements.recordingToggle.checked));
  elements.startRecordingButton.addEventListener("click", () => updateRecording(true));
  elements.liveTab.addEventListener("click", () => setView("live"));
  elements.savedTab.addEventListener("click", () => setView("saved"));
  elements.quickTab.addEventListener("click", () => setView("quick"));
  elements.quickForm.addEventListener("submit", handleQuickSubmit);
  elements.quickForm.addEventListener("input", markQuickDraftDirty);
  elements.quickForm.addEventListener("change", markQuickDraftDirty);
  elements.quickForm.addEventListener("click", handleQuickOptionClick);
  elements.resetQuickButton.addEventListener("click", resetQuickForm);
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
  const tabs = [elements.liveTab, elements.savedTab, elements.quickTab];
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
  const previousStatus = `${state.session.error}\u0000${state.session.notice}`;
  const normalizedSession = { ...createDisconnectedSession(), ...(nextSession || {}) };
  const nextStatus = `${normalizedSession.error}\u0000${normalizedSession.notice}`;
  if (nextStatus !== previousStatus) state.statusDismissed = false;
  state.session = normalizedSession;
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
  state.quickDraftDirty = false;
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
  state.quickDraftDirty = false;
  syncDataToWorker();
  render();
  showFlash(`已从 ${importResult.fileName} 导入`, "success");
  return true;
}

// 标记快捷配置表单存在尚未应用的改动。
function markQuickDraftDirty() {
  state.quickDraftDirty = true;
  renderQuickIdentityOutcome();
}

// 切换灰度能力按钮的开启状态。
function handleQuickOptionClick(event) {
  const button = event.target.closest("[data-beta-value]");
  if (!button || !elements.quickForm.contains(button)) return;
  button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"));
  markQuickDraftDirty();
}

// 将快捷配置保存到浏览器并通知后台刷新页面生效。
async function handleQuickSubmit(event) {
  event.preventDefault();
  if (state.quickApplying || !state.storageReady || !state.session.tabId) return;
  const quickConfig = readQuickForm();
  state.quickApplying = true;
  renderQuickConfig();
  const saved = await persistData(
    (data) => ({ ...data, quickConfig }),
    "快捷配置已保存"
  );
  if (saved) {
    state.quickDraftDirty = false;
    postWorkerMessage({ type: PANEL_MESSAGE_TYPES.APPLY_QUICK_CONFIG });
  }
  state.quickApplying = false;
  renderQuickConfig();
}

// 从原生表单读取并规范化一份快捷配置。
function readQuickForm() {
  const values = new FormData(elements.quickForm);
  const betaFunctions = [...elements.quickForm.querySelectorAll('[data-beta-value][aria-pressed="true"]')]
    .map((button) => Number(button.dataset.betaValue));
  const originalBetaFunctions = getQuickOriginalBetaFunctions();
  const betaEnabled = betaFunctions.length !== originalBetaFunctions.length
    || betaFunctions.some((value) => !originalBetaFunctions.includes(value));
  return normalizeQuickConfig({
    role: values.get("role"),
    corpPreset: values.get("corpPreset"),
    version: values.get("version"),
    locale: values.get("locale"),
    maxRowSize: values.get("maxRowSize"),
    maxMemPerTaskMB: values.get("maxMemPerTaskMB"),
    highPerformance: readOptionalBoolean(values.get("highPerformance")),
    groupRole: values.get("groupRole"),
    platformRole: values.get("platformRole"),
    publishAuth: readOptionalBoolean(values.get("publishAuth")),
    removeCaseAuth: readOptionalBoolean(values.get("removeCaseAuth")),
    projectAuth: values.get("projectAuth"),
    policiesEnabled: values.get("policiesEnabled") === "true",
    policies: values.getAll("policies"),
    betaEnabled,
    betaFunctions: betaEnabled ? betaFunctions : [],
    deployType: values.get("deployType"),
    productEdition: values.get("productEdition"),
    versionStatus: values.get("versionStatus"),
    portalEnabled: readOptionalBoolean(values.get("portalEnabled")),
    mobileHomeDirectEnabled: readOptionalBoolean(values.get("mobileHomeDirectEnabled")),
    timezone: values.get("timezone"),
    timeFormat: values.get("timeFormat"),
    weekStart: values.get("weekStart")
  }, state.session.quickOriginalValues);
}

// 返回当前页面从系统信息接口识别出的灰度能力列表。
function getQuickOriginalBetaFunctions() {
  return Array.isArray(state.session.quickOriginalValues?.betaFunctions)
    ? state.session.quickOriginalValues.betaFunctions.map(Number)
    : [];
}

// 将三态下拉框文本转换为布尔值或保持原值。
function readOptionalBoolean(value) {
  return value === "true" ? true : value === "false" ? false : null;
}

// 用默认值重置快捷配置草稿，等待用户主动应用。
function resetQuickForm() {
  fillQuickForm(createDefaultQuickConfig());
  markQuickDraftDirty();
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

// 将实时请求的 Method 和 URL 路径加入持久接口过滤列表。
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

// 持久保存命名规则的互斥启用状态并同步到当前会话。
async function updateActiveRule(rule, enabled) {
  const groupKey = buildRuleGroupKey(rule.method, rule.url, rule.stage);
  await persistData(
    (data) => ({
      ...data,
      rules: data.rules.map((item) => {
        if (buildRuleGroupKey(item.method, item.url, item.stage) !== groupKey) return item;
        const nextEnabled = item.id === rule.id ? enabled : false;
        return item.enabled === nextEnabled
          ? item
          : { ...item, enabled: nextEnabled, updatedAt: new Date().toISOString() };
      })
    }),
    enabled ? "替换规则已启用" : "替换规则已停用"
  );
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
    help: `将保存 ${patches.length} 个字段操作，按 ${pending.method} + 请求路径跨域匹配`,
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
    help: `保存完整 Body，用于 ${pending.method} + 请求路径跨域共用`,
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
  if (!pending || !template || buildInterfaceKey(template.method, template.url) !== buildInterfaceKey(pending.method, pending.url)) return;
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
  renderQuickConfig();
  if (state.view === "editor") renderEditor();
  else if (state.view === "applied") renderAppliedChange();
  renderVisibility();
}

// 仅渲染需要用户处理的错误状态。
function renderStatus() {
  const error = state.session.error || state.storageError || (state.flashType === "error" ? state.flashMessage : "");
  const message = state.statusDismissed ? "" : error;
  elements.statusMessageText.textContent = message;
  elements.statusMessage.className = "status-message";
  elements.statusMessage.classList.toggle("has-message", Boolean(message));
  if (message) elements.statusMessage.classList.add("is-error");
  elements.dismissStatusButton.hidden = !message;
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
    ? "正在记录、拦截并应用已保存规则和快捷配置。"
    : "开启后将记录接口，并应用已保存规则和快捷配置。";
  elements.recordingToggle.checked = recording;
  elements.recordingToggle.disabled = state.recordingChanging || !state.session.tabId;
  elements.recordingToggle.setAttribute("aria-label", recording ? "停止接口记录" : "开启接口记录");
}

// 渲染主 Tab 和已保存内容子 Tab 的选中状态与数量。
function renderTabs() {
  const liveActive = state.view === "live";
  const savedActive = state.view === "saved";
  const quickActive = state.view === "quick";
  setTabState(elements.liveTab, liveActive);
  setTabState(elements.savedTab, savedActive);
  setTabState(elements.quickTab, quickActive);
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

// 渲染快捷配置表单，并保护尚未应用的本地草稿。
function renderQuickConfig() {
  if (!state.quickDraftDirty) fillQuickForm(state.data.quickConfig);
  renderQuickCombination();
  renderQuickIdentityOutcome();
  elements.applyQuickButton.disabled = state.quickApplying || !state.storageReady || !state.session.tabId;
  elements.resetQuickButton.disabled = state.quickApplying;
}

// 展示用户主动修改的快捷配置摘要。
function renderQuickCombination() {
  const config = readQuickForm();
  const changedNames = new Set(getQuickConfigChanges(config));
  const chips = [...elements.quickForm.querySelectorAll("select[name], input[name]")]
    .filter((control) => changedNames.has(control.name) && control.value)
    .map((control) => {
      const label = control.closest(".quick-row")?.querySelector(":scope > span")?.firstChild?.textContent?.trim()
        || control.name;
      const value = control.tagName === "SELECT" ? control.selectedOptions[0]?.textContent : control.value;
      return createElement("span", "quick-combination-chip", `${label}：${value}`);
    });
  if (config.betaEnabled) {
    const originalBetaFunctions = getQuickOriginalBetaFunctions();
    for (const button of elements.quickForm.querySelectorAll("[data-beta-value]")) {
      const value = Number(button.dataset.betaValue);
      const pressed = button.getAttribute("aria-pressed") === "true";
      if (pressed === originalBetaFunctions.includes(value)) continue;
      const action = pressed ? "" : "关闭 ";
      chips.push(createElement("span", "quick-combination-chip", `灰度能力：${action}${button.textContent.trim()}`));
    }
  }
  elements.quickCombination.closest(".quick-combination").hidden = chips.length === 0;
  elements.quickCombination.replaceChildren(...chips);
}

// 将接口返回的核心原值显示为表单默认项，并展示最终权限结果。
function renderQuickIdentityOutcome() {
  const config = readQuickForm();
  const originalValues = state.session.quickOriginalValues || {};
  const platformOnlyNames = new Set(["timezone", "timeFormat", "weekStart"]);
  const platformConfigUnavailable = originalValues.corpPreset
    && !["fusion", "fusionIam"].includes(originalValues.corpPreset);
  for (const name of [
    "role", "corpPreset", "version", "locale", "highPerformance", "groupRole", "platformRole",
    "publishAuth", "removeCaseAuth", "projectAuth", "deployType", "productEdition", "versionStatus",
    "portalEnabled", "mobileHomeDirectEnabled", "timezone", "timeFormat", "weekStart"
  ]) {
    const select = elements.quickForm.elements.namedItem(name);
    const originalOption = select.querySelector('option[value=""]');
    const valueOption = [...select.options].find((option) => option.value === String(originalValues[name]));
    const missingText = platformConfigUnavailable && platformOnlyNames.has(name)
      ? "当前企业无接口值"
      : "刷新页面后识别";
    originalOption.textContent = valueOption?.textContent
      || (originalValues[name] === undefined ? missingText : String(originalValues[name]));
  }
  for (const name of ["maxRowSize", "maxMemPerTaskMB"]) {
    const input = elements.quickForm.elements.namedItem(name);
    input.placeholder = originalValues[name] === undefined ? "刷新页面后识别" : String(originalValues[name]);
  }
  const viewer = config.role === 2;
  const original = "接口原值（运行时决定）";
  const groupRole = config.groupRole ?? (viewer ? 1 : originalValues.groupRole);
  const platformRole = config.platformRole ?? (viewer ? -1 : originalValues.platformRole);
  const publishAuth = config.publishAuth ?? (viewer ? false : originalValues.publishAuth);
  const removeCaseAuth = config.removeCaseAuth ?? (viewer ? false : originalValues.removeCaseAuth);
  const space = groupRole === 0 ? "空间管理员" : groupRole === 1 ? "空间成员" : original;
  const platform = platformRole === 0 ? "平台系统管理员" : platformRole === -1 ? "普通用户" : original;
  const publish = publishAuth === undefined ? original : publishAuth ? "允许发布" : "禁止发布";
  const removeCase = removeCaseAuth === undefined ? original : removeCaseAuth ? "允许下架" : "禁止下架";
  const project = viewer
    ? "无项目编辑权限（查看者身份优先）"
    : ({ manager: "项目管理员", edit: "项目编辑者", view: "项目查看者" }[
      config.projectAuth ?? originalValues.projectAuth
    ] || original);
  elements.quickIdentityOutcome.textContent = `当前结果：${space} · ${platform} · ${publish} · ${removeCase} · ${project}`;
}

// 将规范化快捷配置写入各原生表单控件。
function fillQuickForm(input) {
  const config = normalizeQuickConfig(input);
  const form = elements.quickForm;
  for (const name of [
    "role", "corpPreset", "version", "locale", "maxRowSize", "maxMemPerTaskMB", "groupRole", "platformRole", "projectAuth",
    "deployType", "productEdition", "versionStatus", "timezone", "timeFormat", "weekStart", "highPerformance", "policiesEnabled"
  ]) {
    form.elements.namedItem(name).value = config[name] ?? "";
  }
  for (const name of [
    "publishAuth", "removeCaseAuth", "portalEnabled", "mobileHomeDirectEnabled"
  ]) {
    form.elements.namedItem(name).value = config[name] === null ? "" : String(config[name]);
  }
  for (const select of form.querySelectorAll('[name="policies"]')) {
    select.value = config.policies.includes(select.dataset.enabledValue) ? select.dataset.enabledValue : "";
  }
  const betaFunctions = config.betaEnabled ? config.betaFunctions : getQuickOriginalBetaFunctions();
  for (const button of form.querySelectorAll("[data-beta-value]")) {
    button.setAttribute("aria-pressed", String(betaFunctions.includes(Number(button.dataset.betaValue))));
  }
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

// 渲染与当前 Method 和 URL 路径跨域匹配的请求体模板。
function renderMatchingTemplates(pending) {
  const templates = state.data.requestTemplates.filter((template) => (
    buildInterfaceKey(template.method, template.url) === buildInterfaceKey(pending.method, pending.url)
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
  elements.quickView.hidden = state.view !== "quick";
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
    activeRuleIds: {},
    quickOriginalValues: {}
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
  state.statusDismissed = false;
  renderStatus();
}

// 关闭当前状态提示，并在下一条新提示出现时恢复显示。
function dismissStatus() {
  state.statusDismissed = true;
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
