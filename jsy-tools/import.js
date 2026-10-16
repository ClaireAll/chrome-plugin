(() => {
  const key = Symbol.for("claire.jsy-tools");
  if (window[key]) {
    window.postMessage({ channel: "jsy-tools", type: "ready" }, location.origin);
    return;
  }

  const excelPattern = /\.(xlsx|xls|xlsm)$/i;
  let running = false;
  let enabled = false;
  const queue = [];

  function projectId() {
    const match = location.pathname.match(/^\/decision\/home\/project\/([^/]+)(?:\/|$)/);
    if (!match) return null;
    try { return decodeURIComponent(match[1]); }
    catch { return null; }
  }

  function fileDrag(event) {
    return enabled && projectId() && Array.from(event.dataTransfer?.types || []).includes("Files");
  }

  // shortcut: 通过 React Provider 读取现有 QueryClient；产品升级导致结构变化时在上传前停止，避免无法刷新列表。
  function findQueryClient(id) {
    for (const element of document.querySelectorAll("*")) {
      const containerKey = Object.keys(element).find(name => name.startsWith("__reactContainer$"));
      if (!containerKey) continue;
      const root = element[containerKey];
      const stack = [root.stateNode?.current || root];
      const seen = new Set();
      while (stack.length && seen.size < 30000) {
        const fiber = stack.pop();
        if (!fiber || seen.has(fiber)) continue;
        seen.add(fiber);
        const value = fiber.memoizedProps?.value;
        if (typeof value?.getQueryCache === "function" && typeof value.invalidateQueries === "function" &&
            value.getQueryData(["useEditProject", id])?.data) return value;
        if (fiber.child) stack.push(fiber.child);
        if (fiber.sibling) stack.push(fiber.sibling);
      }
    }
    throw new Error("尚未找到项目资源列表，请等待页面加载完成；若持续失败，当前产品版本需适配，未上传文件。");
  }

  function checkTarget(target) {
    if (projectId() !== target.id || window.BI?.system?.currentCorpId !== target.tenant || window.BI?.personal?.userId !== target.owner) {
      throw new Error("项目或登录身份已改变，已停止此文件；请返回原项目检查结果。");
    }
  }

  function checked(result) {
    if (!result || result.errorCode != null) {
      throw new Error(result?.errorMsg || result?.errorCode || "服务器未返回有效结果");
    }
    return result;
  }

  async function request(target, method, url, options = {}) {
    checkTarget(target);
    return checked(await window.HI[method](url, { ...options, skipGlobalError: true }));
  }

  function upload(file, url) {
    const destination = new URL(url, location.href);
    if (destination.protocol !== "https:" && !(destination.protocol === "http:" && location.protocol === "http:" && destination.origin === location.origin)) {
      throw new Error("服务器返回了不安全的上传地址");
    }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", destination.href);
      xhr.timeout = 120000;
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`文件上传失败（HTTP ${xhr.status}）`));
      xhr.onerror = () => reject(new Error("文件上传失败，请检查网络"));
      xhr.ontimeout = () => reject(new Error("文件上传超时"));
      xhr.onabort = () => reject(new Error("文件上传已取消"));
      xhr.send(file);
    });
  }

  async function importFile(item) {
    const { target, file } = item;
    checkTarget(target);
    const BI = window.BI;
    if (typeof window.HI?.reqGet !== "function" || typeof window.HI?.reqPost !== "function" ||
        typeof BI?.cjkEncode !== "function" || !target.owner || BI.hiServletURL !== "/decision") {
      throw new Error("九数云登录环境尚未就绪或版本不兼容，未上传文件。");
    }
    const client = findQueryClient(target.id);
    const baseUrl = `${BI.hiServletURL}/v2`;
    const project = (await request(target, "reqGet", `platform/assets/projects/${encodeURIComponent(target.id)}/files?edit=true`, { baseUrl })).data;
    const auth = project?.cooperators?.find(cooperator => cooperator.member === target.owner)?.authType;
    if (!project?.workspaceId || !["manager", "edit"].includes(auth) || BI.personal.role === 2) {
      throw new Error("当前账号没有项目编辑权限，未上传文件。");
    }

    const info = await request(target, "reqPost", "upload/info", {
      data: { filename: BI.cjkEncode(file.name), type: 0, mimeType: file.type },
    });
    if (!info.url || !info.attachment?.attach_id) throw new Error("服务器未返回有效的上传地址或文件标识");
    checkTarget(target);
    await upload(file, info.url);

    const preview = await request(target, "reqGet", `conf/excel/data/preview/${encodeURIComponent(info.attachment.attach_id)}`, { params: { sheet: -1 } });
    const first = preview.data?.sheets?.[0];
    if (!first || !Number.isInteger(first.sheetNo) || typeof first.sheetName !== "string") throw new Error("文件没有可导入的首个工作表");
    const table = {
      name: "__new_table_id__", type: 3, transferName: "", baseAttach: {}, additionalAttach: [],
      excelFields: ["inner_no", "inner_attachId"].map((name, index) => ({
        type: 16, id: name, name, transferName: name, index: String(index), fromName: name,
      })),
    };
    const parsed = (await request(target, "reqPost", "conf/excel/data", {
      data: { ...table, reset: true, baseAttach: { attach_id: info.attachment.attach_id, sheetNo: first.sheetNo, sheetName: first.sheetName, headIndex: 0 } },
    })).data;
    if (!parsed?.baseAttach?.sheetId || !Array.isArray(parsed.fields)) throw new Error("首个工作表解析结果不完整");

    // 写请求不自动重试：断网时服务端可能已经写入，避免生成重复表。
    item.saving = true;
    const saved = await request(target, "reqPost", "/datasource/excel/add/full", {
      data: {
        folderId: target.id, excelScope: 50,
        excelAddTables: [{
          tableBean: { ...table, excelFields: parsed.fields.filter(field => !field.excelSystemField).slice(2),
            baseAttach: parsed.baseAttach, additionalAttach: parsed.additionalAttach || [], messagePushId: crypto.randomUUID() },
          count: -1, replace: false, title: "",
        }],
      },
    });
    item.saved = true;
    const sourceId = parsed.baseAttach.sheetId;
    const name = `${file.name.replace(/\.[^/.]+$/, "")}_${first.sheetName}`;
    const added = await request(target, "reqPost", "designer/editor/analysis-tables/create-from-data-sources", {
      baseUrl,
      data: [{ type: 50, sourceType: 50, source: sourceId, owner: target.owner, folderId: target.id, pack: target.id,
        transferName: name, projectId: target.id, workspaceId: project.workspaceId, connectId: saved.data?.[0]?.rootId || sourceId }],
    });
    if (!added.data?.success?.[0]?.name || added.data.failed?.length) throw new Error("源表已保存，但加入项目失败");
    item.added = true;
    await Promise.all([
      client.invalidateQueries({ queryKey: ["useEditProject", target.id] }, { throwOnError: true }),
      client.invalidateQueries({ queryKey: ["useEditProjectInfo", target.id] }, { throwOnError: true }),
      client.invalidateQueries({ queryKey: ["project-excel-sources", target.id] }),
    ]);
  }

  async function drainQueue() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const item = queue.shift();
        if (!enabled) continue;
        try {
          await importFile(item);
        } catch (error) {
          const detail = error?.errorMsg || error?.message || "请求失败，请检查登录状态、权限及网络";
          const recovery = item.added ? "已加入项目，请手动刷新列表，勿重复拖入。" :
            item.saved ? "源表已保存，请在 Excel 管理中查看并添加，勿重复拖入。" :
            item.saving ? "保存结果待确认，请先检查 Excel 管理和项目列表，勿直接重复拖入。" : "";
          console.error("[jsy-tools]", item.file.name, detail, recovery);
        }
      }
    } finally {
      running = false;
    }
  }

  window.addEventListener("dragover", event => {
    if (!fileDrag(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.dataTransfer.dropEffect = "copy";
  }, true);
  window.addEventListener("drop", event => {
    if (!fileDrag(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = { id: projectId(), tenant: window.BI?.system?.currentCorpId, owner: window.BI?.personal?.userId };
    const files = Array.from(event.dataTransfer.files);
    for (const file of files) {
      const item = { file, target };
      if (excelPattern.test(file.name) && file.size) queue.push(item);
    }
    if (queue.length) void drainQueue();
  }, true);
  window[key] = true;
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== "jsy-tools" ||
        event.data.type !== "settings" || typeof event.data.quickUploadExcel !== "boolean") return;
    enabled = event.data.quickUploadExcel;
  });
  window.postMessage({ channel: "jsy-tools", type: "ready" }, location.origin);
})();
