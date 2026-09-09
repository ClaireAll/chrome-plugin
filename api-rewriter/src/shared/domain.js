import { DATA_FILE_VERSION, INTERCEPT_STAGES } from "./constants.js";

// 创建一个不包含任何规则、模板和接口过滤项的本地数据对象。
export function createEmptyData() {
  return {
    version: DATA_FILE_VERSION,
    rules: [],
    requestTemplates: [],
    interfaceFilters: []
  };
}

// 校验并清理从浏览器存储或导入 JSON 读取的数据。
export function normalizeData(input) {
  if (input !== undefined && input !== null && (typeof input !== "object" || Array.isArray(input))) {
    throw new Error("规则文件根节点必须是 JSON 对象");
  }
  const source = input || {};
  const version = Number(source.version || DATA_FILE_VERSION);
  if (version > DATA_FILE_VERSION) {
    throw new Error(`文件版本 ${version} 高于当前支持的版本 ${DATA_FILE_VERSION}`);
  }
  if (source.rules !== undefined && !Array.isArray(source.rules)) throw new Error("rules 必须是数组");
  if (source.requestTemplates !== undefined && !Array.isArray(source.requestTemplates)) {
    throw new Error("requestTemplates 必须是数组");
  }
  if (source.interfaceFilters !== undefined && !Array.isArray(source.interfaceFilters)) {
    throw new Error("interfaceFilters 必须是数组");
  }

  const rules = (source.rules || []).map((item, index) => {
    const rule = normalizeRule(item);
    if (!rule) throw new Error(`第 ${index + 1} 条替换规则无效`);
    return rule;
  });
  const requestTemplates = (source.requestTemplates || []).map((item, index) => {
    const template = normalizeRequestTemplate(item);
    if (!template) throw new Error(`第 ${index + 1} 条请求体模板无效`);
    return template;
  });
  const seenFilterKeys = new Set();
  const interfaceFilters = (source.interfaceFilters || []).map((item, index) => {
    const filter = normalizeInterfaceFilter(item);
    if (!filter) throw new Error(`第 ${index + 1} 条接口过滤项无效`);
    return filter;
  }).filter((filter) => {
    const key = buildInterfaceKey(filter.method, filter.url);
    if (seenFilterKeys.has(key)) return false;
    seenFilterKeys.add(key);
    return true;
  });

  return {
    version: DATA_FILE_VERSION,
    rules,
    requestTemplates,
    interfaceFilters
  };
}

// 创建一条按字段差异执行的请求或响应替换规则。
export function createRule({ title, method, url, stage, patches }) {
  const rule = normalizeRule({
    id: createId("rule"),
    title,
    method,
    url,
    stage,
    patches,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  if (!rule) throw new Error("替换规则内容无效");
  return rule;
}

// 创建一条与 Method 和完整 URL 绑定的请求体模板。
export function createRequestTemplate({ title, method, url, body }) {
  const template = normalizeRequestTemplate({
    id: createId("template"),
    title,
    method,
    url,
    body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  if (!template) throw new Error("请求体模板内容无效");
  return template;
}

// 创建一条按 Method 和完整 URL 精确匹配的接口过滤项。
export function createInterfaceFilter({ method, url }) {
  const filter = normalizeInterfaceFilter({
    id: createId("filter"),
    method,
    url,
    createdAt: new Date().toISOString()
  });
  if (!filter) throw new Error("接口过滤项无效");
  return filter;
}

// 生成接口过滤和实时记录去重共用的唯一键。
export function buildInterfaceKey(method, url) {
  return `${normalizeMethod(method)}\u0000${String(url || "")}`;
}

// 判断指定 Method 和完整 URL 是否命中持久接口过滤列表。
export function isInterfaceFiltered(filters, method, url) {
  const targetKey = buildInterfaceKey(method, url);
  return (Array.isArray(filters) ? filters : []).some(
    (filter) => buildInterfaceKey(filter?.method, filter?.url) === targetKey
  );
}

// 生成用于互斥启用同接口同方向规则的分组键。
export function buildRuleGroupKey(method, url, stage) {
  return `${normalizeMethod(method)}\u0000${String(url || "")}\u0000${normalizeStage(stage)}`;
}

// 生成用于保存当前标签页手动拦截开关的唯一键。
export function buildManualKey(method, url, stage) {
  return buildRuleGroupKey(method, url, stage);
}

// 从按时间倒序的实时请求中选出每个 Method 和完整 URL 的最新记录。
export function getLatestRequestIds(requests) {
  const seenKeys = new Set();
  const latestIds = new Set();
  for (const request of Array.isArray(requests) ? requests : []) {
    if (!request?.id) continue;
    const key = `${normalizeMethod(request.method)}\u0000${String(request.url || "")}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    latestIds.add(String(request.id));
  }
  return latestIds;
}

// 将已成功应用的请求或响应 Body 记录到当前实时请求的会话内存中。
export function recordAppliedChange(liveRequest, { stage, text, source, sourceTitle = "", appliedAt = Date.now() }) {
  if (!liveRequest || typeof liveRequest !== "object") throw new Error("实时请求记录无效");
  const normalizedStage = normalizeStage(stage);
  if (!normalizedStage) throw new Error("修改方向无效");
  const change = {
    stage: normalizedStage,
    text: String(text || ""),
    source: source === "rule" ? "rule" : "manual",
    sourceTitle: String(sourceTitle || ""),
    appliedAt: Number(appliedAt) || Date.now()
  };
  const appliedChanges = liveRequest.appliedChanges && typeof liveRequest.appliedChanges === "object"
    ? liveRequest.appliedChanges
    : {};
  liveRequest.appliedChanges = { ...appliedChanges, [normalizedStage]: change };
  return { ...change };
}

// 按请求或响应方向读取当前会话内保存的已应用 Body。
export function getAppliedChange(liveRequest, stage) {
  const normalizedStage = normalizeStage(stage);
  const change = normalizedStage ? liveRequest?.appliedChanges?.[normalizedStage] : null;
  return change ? { ...change } : null;
}

// 生成实时请求列表摘要，仅暴露可查看方向而不在每次状态广播中携带完整 Body。
export function serializeLiveRequest(liveRequest) {
  const { appliedChanges, ...summary } = liveRequest;
  return {
    ...summary,
    appliedStages: [INTERCEPT_STAGES.REQUEST, INTERCEPT_STAGES.RESPONSE]
      .filter((stage) => Boolean(appliedChanges?.[stage]))
  };
}

// 计算原始 JSON 与编辑后 JSON 之间需要持久化的字段操作。
export function diffJson(originalValue, nextValue) {
  return diffValue(originalValue, nextValue, "");
}

// 将字段替换操作应用到一份 JSON 数据并返回新对象。
export function applyPatches(input, patches) {
  let result = cloneJson(input);
  for (const patch of Array.isArray(patches) ? patches : []) {
    if (patch.path === "") {
      if (patch.op === "remove") throw new Error("不能删除 JSON 根节点");
      result = cloneJson(patch.value);
      continue;
    }

    const segments = decodePointer(patch.path);
    const key = segments.pop();
    const parent = getPointerParent(result, segments);
    if (patch.op === "remove") {
      removeValue(parent, key);
    } else {
      setValue(parent, key, patch.value);
    }
  }
  return result;
}

// 解析 JSON 文本并返回适合编辑器展示的错误位置。
export function parseJsonText(text) {
  try {
    return { ok: true, value: JSON.parse(String(text)) };
  } catch (error) {
    const source = String(text || "");
    const positionMatch = String(error?.message || "").match(/position\s+(\d+)/i);
    const position = positionMatch ? Number(positionMatch[1]) : -1;
    const location = position >= 0 ? getTextLocation(source, position) : {};
    return {
      ok: false,
      error: error?.message || "JSON 格式错误",
      ...location
    };
  }
}

// 将 JSON 值格式化为侧栏编辑器使用的两空格缩进文本。
export function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

// 计算文本经过 UTF-8 编码后的字节长度。
export function getUtf8ByteLength(text) {
  return new TextEncoder().encode(String(text || "")).byteLength;
}

// 判断规则是否与指定接口和拦截方向精确匹配。
export function matchesRule(rule, method, url, stage) {
  return Boolean(
    rule
      && normalizeMethod(rule.method) === normalizeMethod(method)
      && rule.url === String(url || "")
      && normalizeStage(rule.stage) === normalizeStage(stage)
  );
}

// 清理并验证单条替换规则。
function normalizeRule(input) {
  if (!input || typeof input !== "object") return null;
  const method = normalizeMethod(input.method);
  const url = String(input.url || "").trim();
  const stage = normalizeStage(input.stage);
  const patches = Array.isArray(input.patches) ? input.patches.map(normalizePatch).filter(Boolean) : [];
  if (!method || !url || !stage || !patches.length) return null;
  return {
    id: nonEmptyString(input.id, createId("rule")),
    title: nonEmptyString(input.title, `${method} ${url}`),
    method,
    url,
    stage,
    patches,
    createdAt: validIsoDate(input.createdAt),
    updatedAt: validIsoDate(input.updatedAt)
  };
}

// 清理并验证单条请求体模板。
function normalizeRequestTemplate(input) {
  if (!input || typeof input !== "object" || !("body" in input)) return null;
  const method = normalizeMethod(input.method);
  const url = String(input.url || "").trim();
  if (!method || !url || !isJsonValue(input.body)) return null;
  return {
    id: nonEmptyString(input.id, createId("template")),
    title: nonEmptyString(input.title, `${method} ${url}`),
    method,
    url,
    body: cloneJson(input.body),
    createdAt: validIsoDate(input.createdAt),
    updatedAt: validIsoDate(input.updatedAt)
  };
}

// 清理并验证单条接口过滤项。
function normalizeInterfaceFilter(input) {
  if (!input || typeof input !== "object") return null;
  const method = normalizeMethod(input.method);
  const url = String(input.url || "").trim();
  if (!method || !url) return null;
  return {
    id: nonEmptyString(input.id, createId("filter")),
    method,
    url,
    createdAt: validIsoDate(input.createdAt)
  };
}

// 清理规则中的单个 JSON Pointer 操作。
function normalizePatch(input) {
  if (!input || typeof input !== "object") return null;
  const op = input.op === "remove" ? "remove" : input.op === "set" ? "set" : "";
  const path = typeof input.path === "string" ? input.path : "";
  if (!op || (path && !path.startsWith("/"))) return null;
  if (op === "set" && !isJsonValue(input.value)) return null;
  return op === "remove" ? { op, path } : { op, path, value: cloneJson(input.value) };
}

// 递归计算两个 JSON 值之间的字段操作。
function diffValue(originalValue, nextValue, path) {
  if (isDeepEqual(originalValue, nextValue)) return [];
  if (isPlainObject(originalValue) && isPlainObject(nextValue)) {
    const patches = [];
    const originalKeys = new Set(Object.keys(originalValue));
    for (const key of Object.keys(nextValue)) {
      const childPath = `${path}/${encodePointerSegment(key)}`;
      if (!originalKeys.has(key)) patches.push({ op: "set", path: childPath, value: cloneJson(nextValue[key]) });
      else patches.push(...diffValue(originalValue[key], nextValue[key], childPath));
      originalKeys.delete(key);
    }
    for (const key of originalKeys) {
      patches.push({ op: "remove", path: `${path}/${encodePointerSegment(key)}` });
    }
    return patches;
  }
  return [{ op: "set", path, value: cloneJson(nextValue) }];
}

// 沿 JSON Pointer 定位需要修改字段的父级对象。
function getPointerParent(root, segments) {
  let current = root;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, segment)) {
      throw new Error(`字段路径不存在：/${segments.map(encodePointerSegment).join("/")}`);
    }
    current = current[segment];
  }
  if (!current || typeof current !== "object") throw new Error("字段父级不是对象或数组");
  return current;
}

// 在对象或数组中设置一个 JSON 值。
function setValue(parent, key, value) {
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) throw new Error(`数组下标无效：${key}`);
    parent[index] = cloneJson(value);
    return;
  }
  Object.defineProperty(parent, key, {
    value: cloneJson(value),
    writable: true,
    enumerable: true,
    configurable: true
  });
}

// 从对象或数组中删除一个 JSON 值。
function removeValue(parent, key) {
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) throw new Error(`数组下标无效：${key}`);
    parent.splice(index, 1);
    return;
  }
  if (!Object.hasOwn(parent, key)) throw new Error(`字段路径不存在：${key}`);
  delete parent[key];
}

// 将 JSON Pointer 文本拆分为原始字段名。
function decodePointer(pointer) {
  return String(pointer).slice(1).split("/").map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

// 转义 JSON Pointer 中具有特殊含义的字符。
function encodePointerSegment(segment) {
  return String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
}

// 通过 JSON 序列化创建只包含 JSON 数据的深拷贝。
function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

// 判断值是否为可安全写入 JSON 文件的内容。
function isJsonValue(value) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return false;
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

// 判断值是否为普通 JSON 对象。
function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

// 使用 JSON 语义比较两个值是否完全相同。
function isDeepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// 统一接口请求方法的大小写。
function normalizeMethod(value) {
  return String(value || "").trim().toUpperCase();
}

// 将拦截阶段限制为请求或响应。
function normalizeStage(value) {
  return value === INTERCEPT_STAGES.REQUEST || value === INTERCEPT_STAGES.RESPONSE ? value : "";
}

// 为规则和模板生成稳定且不依赖标题的唯一标识。
function createId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${suffix}`;
}

// 返回有效的非空字符串或指定兜底值。
function nonEmptyString(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

// 统一数据记录中的时间字段。
function validIsoDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

// 根据字符位置计算编辑器可读的行列号。
function getTextLocation(text, position) {
  const prefix = text.slice(0, position);
  const lines = prefix.split("\n");
  return { line: lines.length, column: lines.at(-1).length + 1 };
}
