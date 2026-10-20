(() => {
  const singleton = Symbol.for("claire.jsy-tools.table-style");
  if (window[singleton]) return;
  window[singleton] = true;
  const { normalize, palette } = window.JsyTableStyle;
  let config = normalize({ enabled: false });
  let colors = palette(config);
  let scheduled = false;
  let signature = "";
  const views = new Map();
  const roots = new Set();
  const style = document.createElement("style");
  style.textContent = `
    [data-jsy-table-style] .hd-components-preview-table-header:not(.highlight-column),
    [data-jsy-table-style] .sequence-table-header-cell{background:var(--jsy-table-header)!important;color:#1d293d!important}
    [data-jsy-table-style] .hd-components-preview-table-header .bi-label,
    [data-jsy-table-style] .hd-components-preview-table-header .bi-label > span,
    [data-jsy-table-style] .hd-components-preview-table-header .header-text,
    [data-jsy-table-style] .sequence-table-header-cell{font-size:var(--jsy-table-font)!important}
    [data-jsy-table-style] .hd-components-preview-table-header .bi-label:not(.warning-color),
    [data-jsy-table-style] .hd-components-preview-table-header .header-text:not(.warning-color){color:#1d293d!important}
  `;

  function ordinaryBackground(value) {
    if (!value || value === "transparent") return true;
    const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value);
    let rgb;
    if (hex) {
      const full = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join("") : hex[1];
      rgb = full.match(/../g).map(c => parseInt(c, 16));
    } else rgb = value.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/)?.slice(1).map(Number);
    return Boolean(rgb && Math.min(...rgb) > 225 && Math.max(...rgb) - Math.min(...rgb) < 20);
  }

  function decorate(cell, row, col) {
    if (!cell || row < 2 || col < 1) return cell;
    const result = { ...cell, style: { ...cell.style, fontSize: `${colors.font}px` } };
    if (cell.items) result.items = cell.items.map(item => item.el ? { ...item, el: { ...item.el,
      style: { ...item.el.style, fontSize: `${colors.font}px`, defaultFontSize: `${colors.font}px` } } } : item);
    const header = row === 2;
    // 保留标记、错误等业务底色，只替换普通白色及灰色背景。
    if (ordinaryBackground(cell.backgroundStyle?.backgroundColor)) {
      result.backgroundStyle = { ...cell.backgroundStyle, backgroundColor: header ? colors.header :
        config.preset === "zebra" && row % 2 === 0 ? colors.stripe : "#ffffff" };
    }
    result.borderStyle = { ...cell.borderStyle };
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const name = `border${side}`;
      result.borderStyle[name] = { ...cell.borderStyle?.[name], color: colors.border, style: "solid",
        width: config.preset === "grid" || side === "Bottom" ? 1 : 0 };
    }
    return result;
  }

  function release(view, record, redraw = true) {
    if (view.getCellData === record.wrapper) view.getCellData = record.original;
    if (redraw && record.element.isConnected) record.instance.rerender();
    views.delete(view);
  }

  function update() {
    scheduled = false;
    const active = config.enabled && /^\/decision\/home\/project\/[^/]+(?:\/|$)/.test(location.pathname);
    for (const [view, record] of views) if (!active || !record.element.isConnected) release(view, record);
    for (const root of roots) {
      if (!active || !root.isConnected) {
        root.removeAttribute("data-jsy-table-style");
        root.style.removeProperty("--jsy-table-header");
        root.style.removeProperty("--jsy-table-font");
        roots.delete(root);
      }
    }
    if (!active) { style.remove(); return; }
    if (!style.isConnected) document.documentElement.append(style);
    const seenViews = new Set();
    for (const root of document.querySelectorAll(".hd-conf-analysis-preview-container")) {
      roots.add(root);
      root.setAttribute("data-jsy-table-style", config.preset);
      root.style.setProperty("--jsy-table-header", colors.header);
      root.style.setProperty("--jsy-table-font", `${colors.font}px`);
      const found = new Set();
      for (const element of root.querySelectorAll(".hd-components-preview-structure canvas")) {
        const key = Object.keys(element).find(name => name.startsWith("__reactFiber$"));
        let node = key && element[key];
        // Canvas 可能是表格引擎自行创建；向上找 React 挂载元素。
        for (let parent = element.parentElement; !node && parent && root.contains(parent); parent = parent.parentElement) {
          const fiberKey = Object.keys(parent).find(name => name.startsWith("__reactFiber$"));
          if (fiberKey) node = parent[fiberKey];
        }
        while (node) {
          let hook = node.memoizedState;
          for (let count = 0; hook && count < 150; count++, hook = hook.next) {
            const instance = hook.memoizedState?.current;
            const view = instance?.sheet?.data?.view;
            if (typeof view?.getCellData !== "function" || typeof instance.rerender !== "function" || found.has(view)) continue;
            found.add(view);
            seenViews.add(view);
            let record = views.get(view);
            if (!record) {
              const original = view.getCellData;
              const wrapper = function(row, col) { return decorate(original.call(this, row, col), row, col); };
              record = { original, wrapper, instance, element: root, signature: "" };
              view.getCellData = wrapper;
              views.set(view, record);
            }
            if (record.signature !== signature) { record.signature = signature; instance.rerender(); }
          }
          node = node.return;
        }
      }
    }
    for (const [view, record] of views) if (!seenViews.has(view)) release(view, record, false);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== "jsy-tools" || event.data.type !== "settings") return;
    config = normalize(event.data.tableStyle);
    colors = palette(config);
    signature = JSON.stringify(config);
    schedule();
  });
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
  window.addEventListener("popstate", schedule);
  window.navigation?.addEventListener("navigatesuccess", schedule);
  setInterval(() => { if (config.enabled || views.size) schedule(); }, 1000);
  window.postMessage({ channel: "jsy-tools", type: "ready" }, location.origin);
})();
