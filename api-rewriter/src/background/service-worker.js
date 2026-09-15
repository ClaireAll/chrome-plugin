import {
  INTERCEPT_STAGES,
  MAX_BODY_BYTES,
  MAX_LIVE_REQUESTS,
  PANEL_MESSAGE_TYPES,
  PORT_NAME,
  WORKER_MESSAGE_TYPES
} from "../shared/constants.js";
import {
  applyQuickConfig,
  applyPatches,
  buildInterfaceKey,
  buildManualKey,
  buildRuleGroupKey,
  detectQuickOriginalValues,
  getAppliedChange,
  getUtf8ByteLength,
  isInterfaceFiltered,
  matchesQuickConfig,
  matchesQuickDetection,
  normalizeData,
  normalizeQuickLocale,
  parseJsonText,
  recordAppliedChange,
  serializeLiveRequest
} from "../shared/domain.js";

const DEBUGGER_PROTOCOL_VERSION = "1.3";
const sessions = new Map();
const portContexts = new Map();

void configureSidePanel();

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  void configureSidePanel();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  portContexts.set(port, { tabId: null, data: normalizeData({}), queue: Promise.resolve() });
  port.onMessage.addListener((message) => {
    enqueuePanelMessage(port, message);
  });
  port.onDisconnect.addListener(() => {
    void handlePortDisconnect(port);
  });
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method !== "Fetch.requestPaused" || !source.tabId) return;
  const session = sessions.get(source.tabId);
  if (!session?.connected || !session.recording) return;
  void handlePausedRequestSafely(session, params);
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (!source.tabId) return;
  const session = sessions.get(source.tabId);
  if (!session || session.closing) return;
  if (!session.connected && !session.recording) return;
  session.connected = false;
  session.recording = false;
  session.pending.clear();
  session.error = `调试连接已断开：${reason || "未知原因"}`;
  broadcastState(session);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (sessions.has(tabId)) void cleanupSession(tabId, "标签页已关闭");
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const session = sessions.get(tabId);
  if (!session) return;
  if (changeInfo.url) {
    try {
      if (new URL(session.tabUrl).origin !== new URL(changeInfo.url).origin) {
        session.quickUserId = "";
        const locale = normalizeQuickLocale(chrome.i18n.getUILanguage());
        session.quickOriginalValues = locale ? { locale } : {};
      }
    } catch {}
    session.tabUrl = changeInfo.url;
  }
  if (changeInfo.status === "loading" && session.recording) {
    void resetRuntimeState(session, "页面已加载，继续记录接口");
  }
});

chrome.sidePanel.onClosed?.addListener((info) => {
  for (const session of sessions.values()) {
    const belongsToClosedPanel = info.tabId
      ? session.tabId === info.tabId
      : session.windowId === info.windowId;
    if (!belongsToClosedPanel) continue;
    session.resumeRecordingOnOpen = session.connected && session.recording;
    void stopRecording(session, "Side Panel 已关闭");
  }
});

chrome.sidePanel.onOpened?.addListener((info) => {
  for (const session of sessions.values()) {
    const belongsToOpenedPanel = info.tabId
      ? session.tabId === info.tabId
      : session.windowId === info.windowId;
    if (!belongsToOpenedPanel || !session.resumeRecordingOnOpen) continue;
    session.resumeRecordingOnOpen = false;
    void startRecording(session);
  }
});

// 按 Side Panel 消息到达顺序串行执行会话变更，避免重复附加标签页。
function enqueuePanelMessage(port, message) {
  const context = portContexts.get(port);
  if (!context) return;
  context.queue = context.queue.then(() => handlePanelMessage(port, message));
}

// 配置点击扩展图标时直接打开 Side Panel。
async function configureSidePanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {}
}

// 处理 Side Panel 发来的会话、规则和编辑操作。
async function handlePanelMessage(port, message) {
  try {
    switch (message?.type) {
      case PANEL_MESSAGE_TYPES.ATTACH_TAB:
        await attachPortToTab(port, Number(message.tabId));
        break;
      case PANEL_MESSAGE_TYPES.SYNC_DATA:
        await syncSessionData(port, message.data);
        break;
      case PANEL_MESSAGE_TYPES.APPLY_QUICK_CONFIG:
        await applyQuickConfigAndReload(port);
        break;
      case PANEL_MESSAGE_TYPES.SET_RECORDING:
        await setRecording(port, Boolean(message.enabled));
        break;
      case PANEL_MESSAGE_TYPES.SET_MANUAL_INTERCEPT:
        setManualIntercept(port, message);
        break;
      case PANEL_MESSAGE_TYPES.RESOLVE_PENDING:
        await resolvePending(port, message);
        break;
      case PANEL_MESSAGE_TYPES.GET_APPLIED_CHANGE:
        sendAppliedChange(port, message);
        break;
      case PANEL_MESSAGE_TYPES.CLEAR_REQUESTS:
        clearLiveRequests(port);
        break;
      case PANEL_MESSAGE_TYPES.RESET_SESSION:
        await reconnectSession(port);
        break;
      default:
        break;
    }
  } catch (error) {
    const session = getSessionForPort(port);
    if (session) {
      session.error = error?.message || "操作失败";
      broadcastState(session);
    } else {
      const detached = createDetachedState(Number(message?.tabId) || null, "");
      detached.error = error?.message || "操作失败";
      safePostMessage(port, { type: WORKER_MESSAGE_TYPES.STATE, state: detached });
    }
  }
}

// 将 Side Panel 连接绑定到当前活动标签页，默认保持停止记录状态。
async function attachPortToTab(port, tabId) {
  if (!Number.isInteger(tabId)) throw new Error("当前标签页无效");
  const context = portContexts.get(port);
  if (!context) return;
  if (context.tabId && context.tabId !== tabId) await cleanupSession(context.tabId, "已切换标签页");
  const tab = await chrome.tabs.get(tabId);
  if (!isSupportedTabUrl(tab.url)) {
    if (context.tabId) await cleanupSession(context.tabId, "当前页面不支持网络拦截");
    throw new Error("当前页面不支持网络拦截");
  }
  if (sessions.has(tabId)) await cleanupSession(tabId, "重新连接当前标签页");

  const session = createSession(tab, port, context.data);
  sessions.set(tabId, session);
  context.tabId = tabId;
  session.notice = "";
  broadcastState(session);
}

// 创建一个仅在当前标签页和 Side Panel 生命周期内存在的运行会话。
function createSession(tab, port, data) {
  const normalizedData = normalizeData(data);
  const locale = normalizeQuickLocale(chrome.i18n.getUILanguage());
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    tabUrl: tab.url || "",
    port,
    connected: false,
    recording: false,
    resumeRecordingOnOpen: false,
    closing: false,
    error: "",
    notice: "",
    data: normalizedData,
    manualKeys: new Set(),
    activeRuleIds: createActiveRuleIds(normalizedData.rules, normalizedData.interfaceFilters),
    liveRequests: new Map(),
    pending: new Map(),
    nextSequence: 0,
    generation: 0,
    languageScriptId: "",
    quickUserId: "",
    quickOriginalValues: locale ? { locale } : {}
  };
}

// 按总开关状态启动或停止当前标签页的接口记录与改写。
async function setRecording(port, enabled) {
  const session = getSessionForPort(port);
  if (!session) throw new Error("当前标签页尚未就绪");
  if (enabled) await startRecording(session);
  else await stopRecording(session, "");
}

// 附加调试器并启用 Fetch 请求与响应阶段的统一拦截。
async function startRecording(session) {
  if (session.connected && session.recording) return;
  try {
    await chrome.debugger.attach({ tabId: session.tabId }, DEBUGGER_PROTOCOL_VERSION);
    await chrome.debugger.sendCommand({ tabId: session.tabId }, "Network.enable");
    await chrome.debugger.sendCommand({ tabId: session.tabId }, "Page.enable");
    await chrome.debugger.sendCommand({ tabId: session.tabId }, "Fetch.enable", {
      patterns: [
        { urlPattern: "*", resourceType: "XHR", requestStage: "Request" },
        { urlPattern: "*", resourceType: "Fetch", requestStage: "Request" },
        { urlPattern: "*", resourceType: "XHR", requestStage: "Response" },
        { urlPattern: "*", resourceType: "Fetch", requestStage: "Response" }
      ]
    });
    session.connected = true;
    session.recording = true;
    session.activeRuleIds = createActiveRuleIds(session.data.rules, session.data.interfaceFilters);
    await syncLanguageOverride(session);
    session.error = "";
    session.notice = "";
  } catch (error) {
    try {
      await chrome.debugger.detach({ tabId: session.tabId });
    } catch {}
    session.connected = false;
    session.recording = false;
    session.error = `无法开始接口记录：${error?.message || "调试连接被占用"}`;
  }
  broadcastState(session);
}

// 原样放行等待项并解除调试器，同时保留当前实时请求列表。
async function stopRecording(session, notice) {
  session.generation += 1;
  const wasConnected = session.connected;
  if (wasConnected) await removeLanguageOverride(session);
  session.connected = false;
  session.recording = false;
  const pendingItems = [...session.pending.values()];
  session.pending.clear();
  const releaseErrors = await releasePendingItems(session.tabId, pendingItems);
  if (wasConnected) {
    try {
      await chrome.debugger.detach({ tabId: session.tabId });
    } catch {}
  }
  session.notice = notice;
  session.error = releaseErrors.length
    ? `停止记录时无法放行等待请求：${releaseErrors[0]?.message || "协议命令失败"}`
    : "";
  broadcastState(session);
}

// 应用快捷配置并刷新当前标签页，让初始化接口和语言设置重新生效。
async function applyQuickConfigAndReload(port) {
  const session = getSessionForPort(port);
  if (!session) throw new Error("当前标签页尚未就绪");
  const wasRecording = session.connected && session.recording;
  if (!wasRecording) await startRecording(session);
  if (!session.connected || !session.recording) {
    throw new Error(session.error || "无法启动接口记录");
  }
  if (wasRecording) await syncLanguageOverride(session);
  session.notice = "快捷配置已应用，页面正在刷新";
  broadcastState(session);
  await chrome.tabs.reload(session.tabId);
}

// 将浏览器本地存储中的规则、模板和接口过滤项同步到当前拦截会话。
async function syncSessionData(port, input) {
  const context = portContexts.get(port);
  if (!context) return;
  const previousQuickConfig = JSON.stringify(context.data.quickConfig);
  const previousFilterKeys = new Set((context.data.interfaceFilters || []).map(
    (filter) => buildInterfaceKey(filter.method, filter.url)
  ));
  context.data = normalizeData(input);
  const session = getSessionForPort(port);
  if (!session) return;
  session.data = context.data;
  session.activeRuleIds = createActiveRuleIds(session.data.rules, session.data.interfaceFilters);
  if (session.connected && session.recording && previousQuickConfig !== JSON.stringify(session.data.quickConfig)) {
    await syncLanguageOverride(session);
  }
  const nextFilterKeys = new Set(session.data.interfaceFilters.map(
    (filter) => buildInterfaceKey(filter.method, filter.url)
  ));
  if (!setsEqual(previousFilterKeys, nextFilterKeys)) {
    session.generation += 1;
    await applyInterfaceFilters(session);
  }
  broadcastState(session);
}

// 立即移除命中过滤项的记录和开关，并原样放行对应等待请求。
async function applyInterfaceFilters(session) {
  const matchesFilter = (item) => isInterfaceFiltered(session.data.interfaceFilters, item.method, item.url);
  const filteredPending = [...session.pending.values()].filter(matchesFilter);
  for (const pending of filteredPending) session.pending.delete(pending.id);
  for (const [requestId, request] of session.liveRequests) {
    if (matchesFilter(request)) session.liveRequests.delete(requestId);
  }
  for (const filter of session.data.interfaceFilters) {
    for (const stage of [INTERCEPT_STAGES.REQUEST, INTERCEPT_STAGES.RESPONSE]) {
      session.manualKeys.delete(buildManualKey(filter.method, filter.url, stage));
      session.activeRuleIds.delete(buildRuleGroupKey(filter.method, filter.url, stage));
    }
  }
  const releaseErrors = await releasePendingItems(session.tabId, filteredPending);
  if (releaseErrors.length && session.connected) {
    await stopRecording(session, "接口记录已停止");
    session.error = `应用接口过滤时无法放行等待请求：${releaseErrors[0]?.message || "协议命令失败"}`;
  }
}

// 开启或关闭指定接口和方向的手动暂停开关。
function setManualIntercept(port, message) {
  const session = getSessionForPort(port);
  if (!session?.connected) return;
  const key = buildManualKey(message.method, message.url, message.stage);
  if (message.enabled) session.manualKeys.add(key);
  else session.manualKeys.delete(key);
  broadcastState(session);
}

// 为单个 CDP 暂停事件提供原样放行和断开调试连接的最终恢复保护。
async function handlePausedRequestSafely(session, params) {
  try {
    await handlePausedRequest(session, params);
  } catch (error) {
    if (session.closing || !session.connected || !session.recording) return;
    const live = session.liveRequests.get(String(params.networkId || params.requestId));
    try {
      await continueOriginal(session.tabId, params.requestId);
      if (live) live.lastError = `改写失败，已原样放行：${error?.message || "协议命令失败"}`;
      broadcastState(session);
      return;
    } catch (fallbackError) {
      if (isRequestAlreadyReleasedError(error) || isRequestAlreadyReleasedError(fallbackError)) {
        if (live) live.lastError = "请求已结束，无法继续改写";
        broadcastState(session);
        return;
      }
      await cleanupSession(
        session.tabId,
        "",
        `改写失败且无法原样放行，已断开调试连接：${fallbackError?.message || error?.message || "协议命令失败"}`
      );
    }
  }
}

// 接收 CDP 暂停事件并按自动规则和手动开关处理 JSON Body。
async function handlePausedRequest(session, params) {
  const generation = session.generation;
  const sequence = session.nextSequence++;
  const stage = isResponseStage(params) ? INTERCEPT_STAGES.RESPONSE : INTERCEPT_STAGES.REQUEST;
  const method = String(params.request?.method || "GET").toUpperCase();
  const url = String(params.request?.url || "");
  if (isInterfaceFiltered(session.data.interfaceFilters, method, url)) {
    await continueOriginal(session.tabId, params.requestId);
    return;
  }
  const live = upsertLiveRequest(session, params, stage, method, url);
  const activeRule = getActiveRule(session, method, url, stage);
  const manualEnabled = session.manualKeys.has(buildManualKey(method, url, stage));
  const quickEnabled = matchesQuickConfig(session.data.quickConfig, method, url, stage);
  const quickDetectionEnabled = matchesQuickDetection(method, url, stage);

  if (!activeRule && !manualEnabled && !quickEnabled && !quickDetectionEnabled) {
    await continueOriginal(session.tabId, params.requestId);
    broadcastState(session);
    return;
  }

  const bodyResult = await readPausedBody(session.tabId, params, stage);
  if (!bodyResult.ok) {
    live.lastError = bodyResult.message;
    await continueOriginal(session.tabId, params.requestId);
    broadcastState(session);
    return;
  }
  if (getUtf8ByteLength(bodyResult.text) > MAX_BODY_BYTES) {
    live.lastError = "Body 超过 5 MB，已原样放行";
    await continueOriginal(session.tabId, params.requestId);
    broadcastState(session);
    return;
  }

  const parsed = parseJsonText(bodyResult.text);
  if (!parsed.ok) {
    live.lastError = "Body 不是有效 JSON，已原样放行";
    await continueOriginal(session.tabId, params.requestId);
    broadcastState(session);
    return;
  }
  if (session.generation !== generation || session.closing || !session.connected || !session.recording) {
    await continueOriginal(session.tabId, params.requestId);
    return;
  }

  if (stage === INTERCEPT_STAGES.RESPONSE && method === "GET" && /\/decision\/v1\/user\/info(?:[?#]|$)/.test(url)) {
    const userId = parsed.value?.data?.userId;
    if (userId !== undefined && userId !== null) session.quickUserId = String(userId);
  }
  const detectedQuickValues = detectQuickOriginalValues(
    parsed.value,
    method,
    url,
    stage,
    { userId: session.quickUserId }
  );
  if (Object.keys(detectedQuickValues).length) {
    session.quickOriginalValues = { ...session.quickOriginalValues, ...detectedQuickValues };
  }
  const quickResult = applyQuickConfig(
    parsed.value,
    session.data.quickConfig,
    method,
    url,
    stage,
    { userId: session.quickUserId }
  );
  let currentValue = quickResult.value;
  let sourceTitle = quickResult.applied ? "快捷能力" : "";
  if (activeRule) {
    try {
      currentValue = applyPatches(currentValue, activeRule.patches);
      sourceTitle = activeRule.title;
      live.lastAction = `已应用规则：${activeRule.title}`;
      live.lastError = "";
    } catch (error) {
      live.lastError = `规则失败：${error?.message || "字段路径无效"}`;
      if (manualEnabled) {
        addPending(
          session,
          params,
          stage,
          method,
          url,
          bodyResult.text,
          JSON.stringify(currentValue, null, 2),
          quickResult.applied ? { title: "快捷能力" } : null,
          sequence
        );
        live.lastAction = "自动规则失败，等待手动处理";
        broadcastState(session);
        return;
      }
      if (quickResult.applied) {
        const quickText = JSON.stringify(currentValue);
        await continueWithText(session.tabId, params, stage, quickText);
        recordAppliedChange(live, {
          stage,
          text: JSON.stringify(currentValue, null, 2),
          source: "rule",
          sourceTitle: "快捷能力"
        });
      } else {
        await continueOriginal(session.tabId, params.requestId);
      }
      broadcastState(session);
      return;
    }
  }

  if (!quickResult.applied && !activeRule && !manualEnabled) {
    await continueOriginal(session.tabId, params.requestId);
    broadcastState(session);
    return;
  }

  const currentText = JSON.stringify(currentValue, null, 2);
  const outputText = JSON.stringify(currentValue);
  if (getUtf8ByteLength(outputText) > MAX_BODY_BYTES) {
    live.lastError = "自动规则结果超过 5 MB，已忽略该规则";
    if (manualEnabled) {
      addPending(
        session,
        params,
        stage,
        method,
        url,
        bodyResult.text,
        JSON.stringify(parsed.value, null, 2),
        null,
        sequence
      );
      live.lastAction = "等待手动处理";
      broadcastState(session);
      return;
    }
    await continueOriginal(session.tabId, params.requestId);
    broadcastState(session);
    return;
  }
  if (manualEnabled) {
    addPending(
      session,
      params,
      stage,
      method,
      url,
      bodyResult.text,
      currentText,
      sourceTitle ? { title: sourceTitle } : null,
      sequence
    );
    live.lastAction = `等待手动处理${sourceTitle ? "（已先应用自动规则）" : ""}`;
    broadcastState(session);
    return;
  }

  await continueWithText(session.tabId, params, stage, outputText);
  recordAppliedChange(live, {
    stage,
    text: currentText,
    source: "rule",
    sourceTitle
  });
  live.lastAction = `已自动替换${stage === INTERCEPT_STAGES.REQUEST ? "请求" : "响应"} Body`;
  broadcastState(session);
}

// 创建或更新实时请求列表中的一条接口记录。
function upsertLiveRequest(session, params, stage, method, url) {
  const id = String(params.networkId || params.requestId);
  let live = session.liveRequests.get(id);
  if (!live) {
    live = {
      id,
      method,
      url,
      createdAt: Date.now(),
      statusCode: null,
      requestHasJson: false,
      responseSeen: false,
      lastAction: "",
      lastError: "",
      appliedChanges: {}
    };
    session.liveRequests.set(id, live);
    trimLiveRequests(session);
  }

  if (stage === INTERCEPT_STAGES.REQUEST) {
    const requestText = params.request?.postData;
    live.requestHasJson = typeof requestText === "string" && parseJsonText(requestText).ok;
  } else {
    live.responseSeen = true;
    live.statusCode = Number(params.responseStatusCode || 0) || null;
  }
  return live;
}

// 将实时请求列表限制在最近一百条以内。
function trimLiveRequests(session) {
  while (session.liveRequests.size > MAX_LIVE_REQUESTS) {
    const oldestKey = session.liveRequests.keys().next().value;
    session.liveRequests.delete(oldestKey);
  }
}

// 读取请求阶段的 postData 或响应阶段的完整 Body。
async function readPausedBody(tabId, params, stage) {
  if (stage === INTERCEPT_STAGES.REQUEST) {
    return typeof params.request?.postData === "string"
      ? { ok: true, text: params.request.postData }
      : { ok: false, message: "请求没有可编辑的 JSON Body" };
  }

  try {
    const result = await chrome.debugger.sendCommand({ tabId }, "Fetch.getResponseBody", {
      requestId: params.requestId
    });
    return {
      ok: true,
      text: result.base64Encoded ? decodeBase64Text(result.body) : String(result.body || "")
    };
  } catch (error) {
    return { ok: false, message: `读取响应失败：${error?.message || "未知错误"}` };
  }
}

// 将暂停项追加到 FIFO 队列，并保留原始值和自动替换后的当前值。
function addPending(session, params, stage, method, url, originalText, currentText, activeRule, sequence) {
  const id = `${stage}:${params.requestId}`;
  session.pending.set(id, {
    id,
    requestId: params.requestId,
    networkId: params.networkId || "",
    stage,
    method,
    url,
    originalText,
    currentText,
    activeRuleTitle: activeRule?.title || "",
    responseCode: Number(params.responseStatusCode || 200),
    responsePhrase: params.responseStatusText || "",
    responseHeaders: Array.isArray(params.responseHeaders) ? params.responseHeaders : [],
    createdAt: Date.now(),
    sequence
  });
}

// 处理队首暂停项的原样放行或编辑后继续操作。
async function resolvePending(port, message) {
  const session = getSessionForPort(port);
  if (!session) return;
  const current = getCurrentPending(session);
  if (!current || current.id !== message.pendingId) throw new Error("只能按顺序处理当前等待项");

  let appliedText = "";
  if (message.action === "original") {
    await continueOriginal(session.tabId, current.requestId);
  } else {
    const text = String(message.text || "");
    if (getUtf8ByteLength(text) > MAX_BODY_BYTES) throw new Error("编辑后的 JSON 不能超过 5 MB");
    const parsed = parseJsonText(text);
    if (!parsed.ok) throw new Error(parsed.error);
    await continueWithText(session.tabId, current, current.stage, JSON.stringify(parsed.value));
    appliedText = JSON.stringify(parsed.value, null, 2);
  }

  session.pending.delete(current.id);
  const live = session.liveRequests.get(String(current.networkId || current.requestId));
  if (live) {
    if (message.action !== "original") {
      recordAppliedChange(live, {
        stage: current.stage,
        text: appliedText,
        source: "manual",
        sourceTitle: current.activeRuleTitle
      });
    }
    live.lastAction = message.action === "original" ? "已原样放行" : "已应用手动修改";
  }
  session.error = "";
  broadcastState(session);
}

// 按请求记录和方向向 Side Panel 返回当前会话内保存的已应用 Body。
function sendAppliedChange(port, message) {
  const session = getSessionForPort(port);
  const live = session?.liveRequests.get(String(message.requestId || ""));
  const change = getAppliedChange(live, message.stage);
  if (!live || !change) throw new Error("本次修改已失效或已被清除");
  safePostMessage(port, {
    type: WORKER_MESSAGE_TYPES.APPLIED_CHANGE,
    change: {
      ...change,
      requestId: live.id,
      method: live.method,
      url: live.url
    }
  });
}

// 使用原始请求或响应继续当前 CDP 暂停项。
async function continueOriginal(tabId, requestId) {
  await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", { requestId });
}

// 使用编辑后的文本继续请求，或构造新的响应返回页面。
async function continueWithText(tabId, params, stage, text) {
  if (stage === INTERCEPT_STAGES.REQUEST) {
    await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
      requestId: params.requestId,
      postData: encodeBase64Text(text)
    });
    return;
  }

  const fulfillParams = {
    requestId: params.requestId,
    responseCode: Number(params.responseCode || params.responseStatusCode || 200),
    responseHeaders: sanitizeResponseHeaders(params.responseHeaders),
    body: encodeBase64Text(text)
  };
  const responsePhrase = params.responsePhrase || params.responseStatusText;
  if (responsePhrase) fulfillParams.responsePhrase = responsePhrase;
  await chrome.debugger.sendCommand({ tabId }, "Fetch.fulfillRequest", fulfillParams);
}

// 移除与新响应 Body 长度或编码不兼容的原始响应头。
function sanitizeResponseHeaders(headers) {
  const removed = new Set(["content-length", "content-encoding", "transfer-encoding"]);
  return (Array.isArray(headers) ? headers : []).filter((header) => !removed.has(String(header.name || "").toLowerCase()));
}

// 查找当前标签页同接口同方向唯一启用的自动规则。
function getActiveRule(session, method, url, stage) {
  const groupKey = buildRuleGroupKey(method, url, stage);
  const ruleId = session.activeRuleIds.get(groupKey);
  return ruleId ? session.data.rules.find((rule) => rule.id === ruleId) || null : null;
}

// 清空实时请求列表但保留当前开关和等待队列。
function clearLiveRequests(port) {
  const session = getSessionForPort(port);
  if (!session) return;
  session.liveRequests.clear();
  broadcastState(session);
}

// 在连接失败后重新启动当前标签页的接口记录。
async function reconnectSession(port) {
  await setRecording(port, true);
}

// 页面刷新或切换域名时放行队列并清空旧记录，同时保留当前开关。
async function resetRuntimeState(session, notice) {
  session.generation += 1;
  const pendingItems = [...session.pending.values()];
  session.pending.clear();
  session.liveRequests.clear();
  session.notice = notice;
  session.error = "";
  broadcastState(session);
  const releaseErrors = await releasePendingItems(session.tabId, pendingItems);
  if (releaseErrors.length && sessions.get(session.tabId) === session && session.connected && !session.closing) {
    await cleanupSession(
      session.tabId,
      "",
      `页面刷新时无法放行等待请求，已断开调试连接：${releaseErrors[0]?.message || "协议命令失败"}`
    );
  }
}

// 从持久规则中恢复每个未过滤接口和方向最近启用的规则。
function createActiveRuleIds(rules, filters) {
  const activeRuleIds = new Map();
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (rule.enabled && !isInterfaceFiltered(filters, rule.method, rule.url)) {
      activeRuleIds.set(buildRuleGroupKey(rule.method, rule.url, rule.stage), rule.id);
    }
  }
  return activeRuleIds;
}

// Side Panel 断开时释放当前标签页的所有网络暂停项。
async function handlePortDisconnect(port) {
  const context = portContexts.get(port);
  portContexts.delete(port);
  if (context?.tabId) await cleanupSession(context.tabId, "Side Panel 已关闭");
}

// 释放暂停请求、解除调试连接并删除运行会话。
async function cleanupSession(tabId, notice, errorMessage = "") {
  const session = sessions.get(tabId);
  if (!session) return;
  session.closing = true;
  session.generation += 1;
  const wasConnected = session.connected;
  if (wasConnected) await removeLanguageOverride(session);
  session.connected = false;
  const pendingItems = [...session.pending.values()];
  session.pending.clear();
  await releasePendingItems(session.tabId, pendingItems);
  if (wasConnected) {
    try {
      await chrome.debugger.detach({ tabId });
    } catch {}
  }
  sessions.delete(tabId);
  const context = portContexts.get(session.port);
  if (context?.tabId === tabId) context.tabId = null;
  const detachedState = createDetachedState(tabId, notice);
  detachedState.error = errorMessage;
  safePostMessage(session.port, { type: WORKER_MESSAGE_TYPES.STATE, state: detachedState });
}

// 按快捷配置安装或移除下一次页面加载时的语言覆盖脚本。
async function syncLanguageOverride(session) {
  await removeLanguageOverride(session);
  if (!session.data.quickConfig.locale) return;
  const result = await chrome.debugger.sendCommand(
    { tabId: session.tabId },
    "Page.addScriptToEvaluateOnNewDocument",
    { source: createLanguageOverrideSource(session.data.quickConfig.locale) }
  );
  session.languageScriptId = String(result.identifier || "");
}

// 移除当前会话已安装的语言覆盖脚本。
async function removeLanguageOverride(session) {
  if (!session.languageScriptId) return;
  try {
    await chrome.debugger.sendCommand(
      { tabId: session.tabId },
      "Page.removeScriptToEvaluateOnNewDocument",
      { identifier: session.languageScriptId }
    );
  } catch {}
  session.languageScriptId = "";
}

// 生成只影响当前页面运行时、不写入真实 localStorage 的语言覆盖脚本。
function createLanguageOverrideSource(locale) {
  const browserLocale = {
    zh_cn: "zh-CN", zh_tw: "zh-TW", en_us: "en-US", ja_jp: "ja-JP", vi_vn: "vi-VN",
    ru_ru: "ru-RU", fr_fr: "fr-FR", es_es: "es-ES", th_th: "th-TH", id_id: "id-ID",
    ko_kr: "ko-KR", de_de: "de-DE", pt_pt: "pt-PT", km_kh: "km-KH"
  }[locale] || "zh-CN";
  return `(() => {
    const locale = ${JSON.stringify(locale)};
    const browserLocale = ${JSON.stringify(browserLocale)};
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      return this === window.localStorage && (key === "fx.lang" || key === "fx.dev.lang")
        ? locale
        : originalGetItem.call(this, key);
    };
    Object.defineProperty(Navigator.prototype, "language", { configurable: true, get: () => browserLocale });
    Object.defineProperty(Navigator.prototype, "languages", { configurable: true, get: () => [browserLocale] });
  })();`;
}

// 原样放行已从共享队列中同步取出的暂停请求快照。
async function releasePendingItems(tabId, pendingItems) {
  const results = await Promise.allSettled(
    pendingItems.map((pending) => continueOriginal(tabId, pending.requestId))
  );
  return results
    .filter((result) => result.status === "rejected" && !isRequestAlreadyReleasedError(result.reason))
    .map((result) => result.reason);
}

// 获取指定 Side Panel 连接当前绑定的会话。
function getSessionForPort(port) {
  const context = portContexts.get(port);
  return context?.tabId ? sessions.get(context.tabId) || null : null;
}

// 将完整运行状态推送给当前 Side Panel。
function broadcastState(session) {
  safePostMessage(session.port, {
    type: WORKER_MESSAGE_TYPES.STATE,
    state: serializeSession(session)
  });
}

// 将后台会话裁剪为可安全传给侧栏的界面状态。
function serializeSession(session) {
  const currentPending = getCurrentPending(session);
  return {
    tabId: session.tabId,
    tabUrl: session.tabUrl,
    connected: session.connected,
    recording: session.recording,
    error: session.error,
    notice: session.notice,
    pendingCount: session.pending.size,
    currentPending: currentPending ? serializePending(currentPending) : null,
    requests: [...session.liveRequests.values()].map(serializeLiveRequest).reverse(),
    manualKeys: [...session.manualKeys],
    activeRuleIds: Object.fromEntries(session.activeRuleIds),
    quickOriginalValues: session.quickOriginalValues
  };
}

// 按 CDP 暂停事件到达顺序返回 FIFO 队首等待项。
function getCurrentPending(session) {
  return [...session.pending.values()].sort((left, right) => left.sequence - right.sequence)[0] || null;
}

// 删除后台专用响应头，仅返回编辑器处理暂停项所需的数据。
function serializePending(pending) {
  return {
    id: pending.id,
    stage: pending.stage,
    method: pending.method,
    url: pending.url,
    originalText: pending.originalText,
    currentText: pending.currentText,
    activeRuleTitle: pending.activeRuleTitle,
    responseCode: pending.responseCode,
    createdAt: pending.createdAt
  };
}

// 创建没有活动调试连接时的空界面状态。
function createDetachedState(tabId, notice) {
  return {
    tabId,
    tabUrl: "",
    connected: false,
    recording: false,
    error: "",
    notice,
    pendingCount: 0,
    currentPending: null,
    requests: [],
    manualKeys: [],
    activeRuleIds: {},
    quickOriginalValues: {}
  };
}

// 判断 CDP 暂停事件当前位于响应阶段。
function isResponseStage(params) {
  return params.responseStatusCode !== undefined || params.responseErrorReason !== undefined;
}

// 判断标签页是否为扩展允许附加调试器的普通网页。
function isSupportedTabUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

// 判断协议错误是否表示暂停项已经随导航或请求结束而自动释放。
function isRequestAlreadyReleasedError(error) {
  return /invalid (interception|request)|no resource|not found|not paused/i.test(String(error?.message || ""));
}

// 判断两个接口过滤键集合是否完全一致。
function setsEqual(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

// 将 UTF-8 文本编码为 CDP 要求的 Base64 字符串。
function encodeBase64Text(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

// 将 CDP 返回的 Base64 Body 解码为 UTF-8 文本。
function decodeBase64Text(value) {
  const binary = atob(String(value || ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// 在连接已失效时忽略消息发送异常。
function safePostMessage(port, message) {
  try {
    port.postMessage(message);
  } catch {}
}
