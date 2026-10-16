chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage().catch(error => {
    console.error("[jsy-tools] 无法打开配置页面", error);
  });
});

let recentWrite = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "remember-recent-action" || sender.id !== chrome.runtime.id) return;
  let url;
  try { url = new URL(sender.url || "https://invalid.local"); }
  catch { return; }
  const action = message.action;
  const supportedOrigin = url.origin === "http://localhost:10001" ||
    (url.protocol === "https:" && (url.hostname === "jiushuyun.com" || url.hostname.endsWith(".jiushuyun.com")));
  if (!supportedOrigin ||
      !/^\/decision\/home\/project\/[^/]+(?:\/|$)/.test(url.pathname) ||
      !Number.isInteger(action?.key) || action.key < 0 || typeof action.label !== "string" || !action.label.trim() || action.label.length > 120) return;
  // 串行合并多标签页的操作，避免各自读写缓存覆盖另一页的记录。
  recentWrite = recentWrite.then(async () => {
    const settings = await chrome.storage.local.get({ recentActionsEnabled: true, recentActions: [] });
    if (!settings.recentActionsEnabled) return respond({ ok: true });
    const existing = Array.isArray(settings.recentActions) ? settings.recentActions : [];
    const previous = existing.find(item => item?.key === action.key);
    const icon = action.icon && JSON.stringify(action.icon).length <= 24000 ? action.icon : previous?.icon;
    const next = [{ key: action.key, label: action.label.trim(), ...(icon ? { icon } : {}) }, ...existing.filter(item => item?.key !== action.key)];
    await chrome.storage.local.set({ recentActions: next });
    respond({ ok: true });
  }).catch(error => {
    console.error("[jsy-tools] 最近操作保存失败", error);
    respond({ ok: false });
  });
  return true;
});
