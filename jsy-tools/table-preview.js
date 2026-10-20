(() => {
  const singleton = Symbol.for("claire.jsy-tools.table-preview");
  if (window[singleton]) return;
  window[singleton] = true;

  let enabled = false;
  let scheduled = false;
  let replayResponse = null;
  const projects = new Map();
  const requests = new WeakMap();
  const cards = new Map();
  const proto = XMLHttpRequest.prototype;
  const original = { open: proto.open, send: proto.send, abort: proto.abort,
    getAllResponseHeaders: proto.getAllResponseHeaders, getResponseHeader: proto.getResponseHeader };
  const responseProperties = ["readyState", "status", "statusText", "response", "responseText", "responseURL"];

  function projectId() {
    return location.pathname.match(/^\/decision\/home\/project\/([^/]+)(?:\/|$)/)?.[1];
  }

  function stateFor(id) {
    if (!projects.has(id)) projects.set(id, { preview: true, last: null, busy: false, error: "" });
    return projects.get(id);
  }

  function tableKey(table) {
    return JSON.stringify(table, (_key, value) => value && !Array.isArray(value) && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  }

  function isPage(meta) {
    try {
      const url = new URL(meta.url, location.href);
      return meta.method === "POST" && url.origin === location.origin &&
        /^\/decision\/(?:v\d+\/)?conf\/analysis\/operators\/page\/?$/.test(url.pathname);
    } catch { return false; }
  }

  function emptyResult(body) {
    return { errorCode: null, errorMsg: null, data: {
      fields: body.fields || [], preFields: [], data: [], origins: [], operators: body.table?.operators || [],
      invalidOperators: [], pivotWidgets: body.widgets || {}, resultToIdentifyNameMap: {}, messagePushId: "",
      markInfo: { type: 2, marksRows: [], totalMarked: 0, from: [] }, filtered: false,
      pageInfo: { pageIndex: body.limit?.pageIndex || 1, pageSize: 100, totalRows: 0, pagesCount: 1, finished: true },
    } };
  }

  function fakeResponse(xhr, meta, result) {
    meta.fake = true;
    meta.cancelled = false;
    const text = JSON.stringify(result);
    const values = { readyState: 4, status: 200, statusText: "OK", responseURL: new URL(meta.url, location.href).href,
      responseText: text, response: xhr.responseType === "json" ? result : text };
    queueMicrotask(() => {
      if (meta.cancelled || requests.get(xhr) !== meta) return;
      for (const [name, value] of Object.entries(values)) Object.defineProperty(xhr, name, { configurable: true, get: () => value });
      xhr.dispatchEvent(new Event("readystatechange"));
      xhr.dispatchEvent(new ProgressEvent("load"));
      xhr.dispatchEvent(new ProgressEvent("loadend"));
    });
  }

  // 页面内部导入的 reqPost 不经过 HI.reqPost 属性；在其 XHR 发送处只拦精确的 page 端点。
  proto.open = function(method, url, ...args) {
    const previous = requests.get(this);
    if (previous?.fake) for (const name of responseProperties) delete this[name];
    requests.set(this, { method: String(method).toUpperCase(), url: String(url), async: args[0] !== false });
    return original.open.call(this, method, url, ...args);
  };
  proto.send = function(body) {
    const meta = requests.get(this);
    const id = projectId();
    if (!enabled || !id || !meta?.async || !isPage(meta)) return original.send.call(this, body);
    let data;
    try { data = JSON.parse(body); } catch { return original.send.call(this, body); }
    if (!data?.table || !Array.isArray(data.fields)) return original.send.call(this, body);
    const state = stateFor(id);
    const key = tableKey(data.table);
    if (replayResponse?.project === id && replayResponse.key === key && state.preview) {
      const response = replayResponse.result;
      replayResponse = null;
      return fakeResponse(this, meta, response);
    }
    if (state.preview) return original.send.call(this, body);
    state.last = { url: meta.url, body: data, key, consumer: findConsumer(data.table),
      tenant: window.BI?.system?.currentCorpId, owner: window.BI?.personal?.userId };
    state.error = "";
    return fakeResponse(this, meta, emptyResult(data));
  };
  proto.abort = function() {
    const meta = requests.get(this);
    if (meta?.fake) meta.cancelled = true;
    return original.abort.call(this);
  };
  proto.getAllResponseHeaders = function() {
    return requests.get(this)?.fake ? "content-type: application/json\r\n" : original.getAllResponseHeaders.call(this);
  };
  proto.getResponseHeader = function(name) {
    return requests.get(this)?.fake ? (String(name).toLowerCase() === "content-type" ? "application/json" : null)
      : original.getResponseHeader.call(this, name);
  };

  function findConsumer(table) {
    for (const element of document.querySelectorAll(".hd-conf-analysis-preview-container")) {
      const key = Object.keys(element).find(name => name.startsWith("__reactFiber$"));
      let node = key && element[key];
      while (node) {
        const props = node.memoizedProps;
        if (typeof props?.store?.setPageIndex === "function" && typeof props.analysisTableParamsGetter === "function") {
          try {
            if (tableKey(props.analysisTableParamsGetter().table) === tableKey(table)) return { element, props };
          } catch { /* 预览正在卸载时只缓存请求，不保存失效回调。 */ }
        }
        node = node.return;
      }
    }
    return null;
  }

  async function resume(id, state) {
    const last = state.last;
    state.last = null;
    if (!last) return;
    state.busy = true;
    state.error = "";
    schedule();
    try {
      if (projectId() !== id || last.tenant !== window.BI?.system?.currentCorpId || last.owner !== window.BI?.personal?.userId) return;
      if (typeof window.HI?.reqPost !== "function") throw new Error("页面请求入口尚未就绪");
      const result = await window.HI.reqPost(new URL(last.url, location.href).href, { data: last.body, skipGlobalError: true });
      if (result?.errorCode) throw new Error(result.errorMsg || result.errorCode);
      if (!enabled || projects.get(id) !== state || !state.preview || projectId() !== id ||
          last.tenant !== window.BI?.system?.currentCorpId || last.owner !== window.BI?.personal?.userId) return;
      const consumer = findConsumer(last.body.table) || last.consumer;
      if (consumer?.element.isConnected && tableKey(consumer.props.analysisTableParamsGetter().table) === last.key) {
        // 原 Promise 已以空数据结束；用组件原生翻页回调接回响应，不再重复发送 page。
        replayResponse = { project: id, key: last.key, result };
        try { await consumer.props.store.setPageIndex(last.body.limit?.pageIndex || 1); }
        finally { replayResponse = null; }
      }
    } catch (error) {
      state.error = "预览加载失败，请使用页面刷新数据入口重试";
      console.error("[jsy-tools] 补发预览请求失败", error);
    } finally { state.busy = false; schedule(); }
  }

  const style = document.createElement("style");
  style.textContent = `
    [data-jsy-table-preview]{display:flex;align-items:center;gap:10px;margin:0;padding:0 10px;height:var(--jsy-preview-row-height,40px);border:0;background:transparent;color:#23364b;font:13px/1.4 "Microsoft YaHei",sans-serif;box-sizing:border-box;flex-shrink:0;min-width:0}
    [data-jsy-table-preview] svg{width:22px;height:22px;flex:none;color:#00aaa3}
    [data-jsy-table-preview] .jsy-preview-label{flex:1;min-width:0;white-space:nowrap}
    [data-jsy-table-preview] small{display:block;font-size:11px;color:#728b8d;margin-top:2px}
    [data-jsy-table-preview] button{flex:none;position:relative;width:34px;height:20px;padding:0;border:0;border-radius:12px;background:#aeb8c5;cursor:pointer}
    [data-jsy-table-preview] button:after{content:"";position:absolute;left:3px;top:3px;width:14px;height:14px;background:#fff;border-radius:50%;box-shadow:0 1px 2px #0002}
    [data-jsy-table-preview] button[aria-checked=true]{background:#00afa5}
    [data-jsy-table-preview] button[aria-checked=true]:after{left:17px}
    [data-jsy-table-preview] button:focus-visible{outline:2px solid #1689bd;outline-offset:3px}
    [data-jsy-table-preview] button:disabled{cursor:wait;opacity:.6}
    [data-jsy-table-preview][data-compact]{flex-direction:column;justify-content:center;padding:0;gap:2px}
    [data-jsy-table-preview][data-compact] svg{width:18px;height:18px}
    [data-jsy-table-preview][data-compact] .jsy-preview-label{display:none}
  `;

  function update() {
    scheduled = false;
    const id = projectId();
    for (const [entry, card] of cards) {
      if (!enabled || !id || !entry.isConnected || card.dataset.project !== id) { card.remove(); cards.delete(entry); }
    }
    if (!enabled || !id) { style.remove(); return; }
    if (!style.isConnected) document.documentElement.append(style);
    const state = stateFor(id);
    for (const entry of document.querySelectorAll('[data-test-id="project-excel-manager-entry"]')) {
      const anchor = entry.closest(".border-t") || entry;
      let card = cards.get(entry);
      if (!card) {
        card = document.createElement("div");
        card.dataset.jsyTablePreview = "";
        card.dataset.project = id;
        card.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 10h18M3 15h18M10 10v10" stroke="currentColor" stroke-width="1.7"/></svg><div class="jsy-preview-label">表数据预览<small>当前项目</small></div><button type="button" role="switch" aria-label="当前项目的表数据预览"></button>';
        const button = card.querySelector("button");
        button.addEventListener("click", () => {
          if (state.busy || projectId() !== id) return;
          state.preview = !state.preview;
          state.error = "";
          if (state.preview) void resume(id, state);
          schedule();
        });
        cards.set(entry, card);
      }
      if (card.parentElement !== anchor.parentElement || card.nextElementSibling !== anchor) {
        anchor.parentElement.insertBefore(card, anchor);
      }
      const button = card.querySelector("button");
      button.setAttribute("aria-checked", String(state.preview));
      button.disabled = state.busy;
      card.toggleAttribute("data-off", !state.preview);
      card.style.setProperty("--jsy-preview-row-height", `${entry.getBoundingClientRect().height || 40}px`);
      card.toggleAttribute("data-compact", entry.parentElement.getBoundingClientRect().width < 130);
      card.title = state.error || (state.busy ? "正在加载最后一次预览请求的数据" :
        "当前项目：关闭后返回空数据；重新开启时仅补发最后一个被拦截的 page 请求");
      card.querySelector("small").textContent = state.error ? "加载失败，请重试" : state.busy ? "正在加载…" : "当前项目";
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== "jsy-tools" || event.data.type !== "settings") return;
    enabled = event.data.tablePreviewEnabled !== false;
    if (!enabled) {
      projects.clear();
      replayResponse = null;
      for (const card of cards.values()) card.remove();
      cards.clear();
    }
    schedule();
  });
  new MutationObserver(records => {
    if (records.some(record => !record.target.closest?.("[data-jsy-table-preview]"))) schedule();
  }).observe(document, { childList: true, subtree: true });
  window.addEventListener("popstate", schedule);
  window.navigation?.addEventListener("navigatesuccess", schedule);
  window.addEventListener("resize", schedule);
  setInterval(() => { if (enabled || cards.size) schedule(); }, 1000);
  window.postMessage({ channel: "jsy-tools", type: "ready" }, location.origin);
})();
