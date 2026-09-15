import { DATA_FILE_VERSION, INTERCEPT_STAGES } from "./constants.js";

const QUICK_ENDPOINTS = [
  "/decision/v1/version/resource",
  "/decision/v1/version/left",
  "/decision/v1/user/platform-info",
  "/decision/v1/corp/platform-config",
  "/decision/v1/portal/setting",
  "/decision/v1/group/switch/shorturl",
  "/decision/v1/user/info",
  "/decision/v1/system/info",
  "/decision/v1/version"
];
const QUICK_PROJECT_FILES_ENDPOINT = "/v2/platform/assets/projects/:projectId/files";

const CORP_PRESETS = Object.freeze({
  normal: { third: false, corpType: 0, subCorpType: "Default", subIntegrated: false, odmType: "none" },
  dingtalk: { third: true, corpType: 21, subCorpType: "Default", subIntegrated: false, odmType: "none" },
  wecom: { third: true, corpType: 22, subCorpType: "Default", subIntegrated: false, odmType: "none" },
  jiandaoyun: { third: true, corpType: 23, subCorpType: "Default", subIntegrated: false, odmType: "none" },
  lark: { third: true, corpType: 24, subCorpType: "Default", subIntegrated: false, odmType: "none" },
  larkSelf: { third: true, corpType: 25, subCorpType: "Default", subIntegrated: false, odmType: "none" },
  youzan: { third: true, corpType: 26, subCorpType: "Default", subIntegrated: false, odmType: "none" },
  fusion: { third: true, corpType: 23, subCorpType: "Default", subIntegrated: true, odmType: "jdy" },
  fusionIam: { third: true, corpType: 23, subCorpType: "Default", subIntegrated: true, odmType: "integrated" }
});

const QUICK_VERSIONS = ["Hi01000", "Hi01100", "Hi02000", "Hi03000", "Hi04000"];
const QUICK_LOCALES = [
  "zh_cn", "zh_tw", "en_us", "ja_jp", "vi_vn", "ru_ru", "fr_fr",
  "es_es", "th_th", "id_id", "ko_kr", "de_de", "pt_pt", "km_kh"
];
const MANAGEMENT_POLICIES = [
  "memberManager", "securityManager", "dataPortalManager",
  "dataCatalogManager", "dataPrepareManager", "datasourceManager"
];
const BETA_FUNCTIONS = [0, 1, 2, 4, 7, 12, 14, 16, 17, 21, 22, 24, 25, 27, 1000, 1001, 1002];

// 创建一份默认关闭的快捷能力配置。
export function createDefaultQuickConfig() {
  return {
    role: null,
    corpPreset: null,
    version: null,
    locale: null,
    maxRowSize: null,
    maxMemPerTaskMB: null,
    highPerformance: null,
    groupRole: null,
    platformRole: null,
    publishAuth: null,
    removeCaseAuth: null,
    projectAuth: null,
    policiesEnabled: false,
    policies: [],
    betaEnabled: false,
    betaFunctions: [],
    deployType: null,
    productEdition: null,
    versionStatus: null,
    portalEnabled: null,
    mobileHomeDirectEnabled: null,
    timezone: null,
    timeFormat: null,
    weekStart: null
  };
}

// 清理快捷能力配置，并移除与当前接口原值相同的无效覆盖。
export function normalizeQuickConfig(input, originalValues = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const defaults = createDefaultQuickConfig();
  const config = {
    role: normalizeOptionalEnum(source.role, [0, 1, 2, 5]),
    corpPreset: normalizeOptionalEnum(source.corpPreset, Object.keys(CORP_PRESETS)),
    version: normalizeOptionalEnum(source.version, QUICK_VERSIONS),
    locale: normalizeQuickLocale(source.locale),
    maxRowSize: normalizeNonNegativeNumber(source.maxRowSize, defaults.maxRowSize),
    maxMemPerTaskMB: normalizeNonNegativeNumber(source.maxMemPerTaskMB, defaults.maxMemPerTaskMB),
    highPerformance: normalizeOptionalBoolean(source.highPerformance),
    groupRole: normalizeOptionalEnum(source.groupRole, [0, 1]),
    platformRole: normalizeOptionalEnum(source.platformRole, [-1, 0]),
    publishAuth: normalizeOptionalBoolean(source.publishAuth),
    removeCaseAuth: normalizeOptionalBoolean(source.removeCaseAuth),
    projectAuth: normalizeOptionalEnum(source.projectAuth, ["manager", "edit", "view"]),
    policiesEnabled: source.policiesEnabled === true,
    policies: normalizeStringList(source.policies, MANAGEMENT_POLICIES),
    betaEnabled: source.betaEnabled === true,
    betaFunctions: normalizeNumberList(source.betaFunctions, BETA_FUNCTIONS),
    deployType: normalizeOptionalEnum(source.deployType, ["saas", "private-cloud"]),
    productEdition: normalizeOptionalEnum(source.productEdition, ["domestic", "international"]),
    versionStatus: normalizeOptionalEnum(source.versionStatus, ["normal", "expiring", "trial", "delayed", "expired"]),
    portalEnabled: normalizeOptionalBoolean(source.portalEnabled),
    mobileHomeDirectEnabled: normalizeOptionalBoolean(source.mobileHomeDirectEnabled),
    timezone: nonEmptyNullableString(source.timezone),
    timeFormat: normalizeOptionalEnum(source.timeFormat, ["H12", "H24"]),
    weekStart: normalizeOptionalEnum(source.weekStart, ["Mon", "Sun"])
  };
  const originals = isPlainObject(originalValues) ? originalValues : {};
  for (const name of Object.keys(config)) {
    if (Object.hasOwn(originals, name) && JSON.stringify(config[name]) === JSON.stringify(originals[name])) {
      config[name] = defaults[name];
    }
  }
  return config;
}

// 创建一个不包含任何规则、模板和接口过滤项的本地数据对象。
export function createEmptyData() {
  return {
    version: DATA_FILE_VERSION,
    rules: [],
    requestTemplates: [],
    interfaceFilters: [],
    quickConfig: createDefaultQuickConfig()
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
  const quickConfig = source.quickConfig && typeof source.quickConfig === "object"
    ? { ...source.quickConfig }
    : source.quickConfig;
  if (version < 5 && quickConfig) {
    const legacyDefaults = {
      role: 0,
      corpPreset: "lark",
      version: "Hi01000",
      locale: "zh_cn",
      maxRowSize: 5000,
      maxMemPerTaskMB: 8192,
      highPerformance: true
    };
    for (const [name, value] of Object.entries(legacyDefaults)) {
      if (quickConfig[name] === value) quickConfig[name] = null;
    }
  }
  return {
    version: DATA_FILE_VERSION,
    rules,
    requestTemplates,
    interfaceFilters,
    quickConfig: normalizeQuickConfig(quickConfig)
  };
}

// 判断当前响应是否属于快捷能力需要采集的接口。
export function matchesQuickDetection(method, url, stage) {
  if (stage !== INTERCEPT_STAGES.RESPONSE) return false;
  const endpoint = getQuickEndpoint(url);
  if (!endpoint) return false;
  const expectedMethod = endpoint === "/decision/v1/group/switch/shorturl" ? "POST" : "GET";
  return normalizeMethod(method) === expectedMethod;
}

// 判断快捷配置是否需要处理当前接口响应。
export function matchesQuickConfig(config, method, url, stage) {
  if (!config || !matchesQuickDetection(method, url, stage)) return false;
  const endpoint = getQuickEndpoint(url);
  if (endpoint === "/decision/v1/user/info") {
    return config.role !== null || config.groupRole !== null || config.platformRole !== null
      || config.publishAuth !== null || config.removeCaseAuth !== null || config.policiesEnabled;
  }
  if (endpoint === "/decision/v1/group/switch/shorturl") return config.role !== null || config.groupRole !== null;
  if (endpoint === "/decision/v1/system/info") {
    return config.corpPreset !== null || config.deployType !== null || config.productEdition !== null
      || config.betaEnabled;
  }
  if (endpoint === "/decision/v1/version") return config.version !== null;
  if (endpoint === "/decision/v1/version/resource") {
    return config.maxRowSize !== null || config.maxMemPerTaskMB !== null || config.highPerformance !== null;
  }
  if (endpoint === "/decision/v1/version/left") return config.version !== null || config.versionStatus !== null;
  if (endpoint === "/decision/v1/user/platform-info") return config.locale !== null;
  if (endpoint === "/decision/v1/corp/platform-config") {
    return config.locale !== null || config.timezone !== null || config.timeFormat !== null || config.weekStart !== null;
  }
  if (endpoint === "/decision/v1/portal/setting") {
    return config.portalEnabled !== null || config.mobileHomeDirectEnabled !== null;
  }
  if (endpoint === QUICK_PROJECT_FILES_ENDPOINT) return config.projectAuth !== null;
  return Boolean(endpoint);
}

// 将快捷能力组合应用到对应初始化接口的响应副本。
export function applyQuickConfig(input, config, method, url, stage, context = {}) {
  const quick = normalizeQuickConfig(config);
  const endpoint = matchesQuickConfig(quick, method, url, stage) ? getQuickEndpoint(url) : "";
  if (!endpoint || !isPlainObject(input)) return { value: input, applied: false };

  const result = cloneJson(input);
  if (endpoint === "/decision/v1/version") {
    result.data = quick.version;
    return { value: result, applied: true };
  }

  const data = isPlainObject(result.data) ? result.data : {};
  result.data = data;
  if (endpoint === "/decision/v1/user/info") applyQuickUser(data, quick);
  else if (endpoint === "/decision/v1/group/switch/shorturl") {
    if (quick.role !== null) data.corpRole = quick.role;
    if (quick.groupRole !== null || quick.role === 2) data.groupRole = quick.groupRole ?? 1;
  }
  else if (endpoint === QUICK_PROJECT_FILES_ENDPOINT) {
    if (!applyQuickProject(data, quick.projectAuth, context.userId)) return { value: input, applied: false };
  }
  else if (endpoint === "/decision/v1/system/info") applyQuickSystem(data, quick);
  else if (endpoint === "/decision/v1/version/resource") {
    if (quick.maxRowSize !== null) data.maxRowSize = quick.maxRowSize;
    if (quick.maxMemPerTaskMB !== null) data.maxMemPerTaskMB = quick.maxMemPerTaskMB;
    if (quick.highPerformance !== null) data.highPerformance = quick.highPerformance;
  } else if (endpoint === "/decision/v1/version/left") applyQuickVersionStatus(data, quick);
  else if (endpoint === "/decision/v1/portal/setting") {
    if (quick.portalEnabled !== null) data.active = quick.portalEnabled;
    if (quick.mobileHomeDirectEnabled !== null) data.mobileHomeDirectEnabled = quick.mobileHomeDirectEnabled;
  } else if (endpoint === "/decision/v1/corp/platform-config") applyQuickPlatform(data, quick);
  else if (endpoint === "/decision/v1/user/platform-info" && quick.locale !== null) data.locale = quick.locale;
  return { value: result, applied: true };
}

// 从改写前的初始化响应中识别快捷能力界面需要展示的接口原值。
export function detectQuickOriginalValues(input, method, url, stage, context = {}) {
  if (!matchesQuickDetection(method, url, stage) || !isPlainObject(input)) return {};
  const endpoint = getQuickEndpoint(url);
  if (endpoint === "/decision/v1/version") {
    const version = normalizeOptionalEnum(input.data, QUICK_VERSIONS);
    return version === null ? {} : { version };
  }
  if (!isPlainObject(input.data)) return {};
  if (endpoint === "/decision/v1/user/info" || endpoint === "/decision/v1/group/switch/shorturl") {
    const role = Number(endpoint === "/decision/v1/user/info" ? input.data.role : input.data.corpRole);
    const values = [0, 1, 2, 5].includes(role) ? { role } : {};
    const groupRole = normalizeOptionalEnum(input.data.groupRole, [0, 1]);
    if (groupRole !== null) values.groupRole = groupRole;
    if (endpoint === "/decision/v1/user/info") {
      const platformRole = normalizeOptionalEnum(input.data.platformRole, [-1, 0]);
      if (platformRole !== null) values.platformRole = platformRole;
      if (typeof input.data.publishAuth === "boolean") values.publishAuth = input.data.publishAuth;
      if (input.data.portalRole !== undefined && input.data.portalRole !== null) {
        values.removeCaseAuth = Number(input.data.portalRole) === 4;
      }
    }
    return values;
  }
  if (endpoint === "/decision/v1/user/platform-info") {
    const locale = normalizeQuickLocale(input.data.locale);
    return locale === null ? {} : { locale };
  }
  if (endpoint === "/decision/v1/version/resource") {
    const values = {};
    for (const name of ["maxRowSize", "maxMemPerTaskMB"]) {
      const value = input.data[name];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) values[name] = value;
    }
    if (typeof input.data.highPerformance === "boolean") values.highPerformance = input.data.highPerformance;
    return values;
  }
  if (endpoint === "/decision/v1/version/left") {
    const version = normalizeOptionalEnum(input.data.version, QUICK_VERSIONS);
    return version === null ? {} : { version };
  }
  if (endpoint === QUICK_PROJECT_FILES_ENDPOINT) {
    const userId = String(context.userId || "");
    const cooperator = (Array.isArray(input.data.cooperators) ? input.data.cooperators : [])
      .find((item) => userId && String(item?.member) === userId);
    const projectAuth = normalizeOptionalEnum(cooperator?.authType, ["manager", "edit", "view"]);
    return projectAuth === null ? {} : { projectAuth };
  }
  if (endpoint === "/decision/v1/corp/platform-config") {
    const tenant = input.data.tenant;
    if (!isPlainObject(tenant)) return {};
    const values = {};
    const timezone = nonEmptyNullableString(tenant.timezone?.etc);
    const timeFormat = normalizeOptionalEnum(tenant.region?.timeFormat?.type, ["H12", "H24"]);
    const weekStart = normalizeOptionalEnum(tenant.region?.weekStart, ["Mon", "Sun"]);
    if (timezone !== null) values.timezone = timezone;
    if (timeFormat !== null) values.timeFormat = timeFormat;
    if (weekStart !== null) values.weekStart = weekStart;
    return values;
  }
  if (endpoint !== "/decision/v1/system/info") return {};
  const values = Array.isArray(input.data.betaFunc)
    ? { betaFunctions: normalizeNumberList(input.data.betaFunc, BETA_FUNCTIONS) }
    : {};
  const deployType = normalizeOptionalEnum(input.data.deployType, ["saas", "private-cloud"]);
  const productEdition = normalizeOptionalEnum(input.data.productEdition, ["domestic", "international"]);
  if (deployType !== null) values.deployType = deployType;
  if (productEdition !== null) values.productEdition = productEdition;
  if (input.data.subIntegrated === true) {
    values.corpPreset = input.data.config?.odmType === "integrated" ? "fusionIam" : "fusion";
    return values;
  }
  const corpPreset = ({ 0: "normal", 21: "dingtalk", 22: "wecom", 23: "jiandaoyun", 24: "lark", 25: "larkSelf", 26: "youzan" })[
    Number(input.data.corpType)
  ];
  if (corpPreset || input.data.third === false) values.corpPreset = corpPreset || "normal";
  return values;
}

// 返回相对默认值真正发生变化的快捷配置字段。
export function getQuickConfigChanges(input) {
  const config = normalizeQuickConfig(input);
  const defaults = createDefaultQuickConfig();
  return Object.keys(defaults).filter(
    (name) => JSON.stringify(config[name]) !== JSON.stringify(defaults[name])
  );
}

// 修改用户身份、发布权限和专项管理权限。
function applyQuickUser(data, quick) {
  const viewer = quick.role === 2;
  if (quick.role !== null) data.role = quick.role;
  if (quick.groupRole !== null || viewer) data.groupRole = quick.groupRole ?? 1;
  if (quick.platformRole !== null || viewer) data.platformRole = quick.platformRole ?? -1;
  if (quick.publishAuth !== null || viewer) data.publishAuth = quick.publishAuth ?? false;
  if (quick.removeCaseAuth !== null || viewer) data.portalRole = (quick.removeCaseAuth ?? false) ? 4 : 0;
  if (!quick.policiesEnabled && !viewer) return;
  const untouched = (Array.isArray(data.policy) ? data.policy : [])
    .filter((item) => !MANAGEMENT_POLICIES.includes(item?.action));
  data.policy = [
    ...untouched,
    ...(quick.policiesEnabled ? quick.policies : []).map((action) => ({ action, effect: "allow", resource: "all" }))
  ];
}

// 仅修改当前用户在项目协作者列表中的权限。
function applyQuickProject(data, projectAuth, userId) {
  const member = String(userId || "");
  if (!member || projectAuth === null) return false;
  const cooperators = Array.isArray(data.cooperators) ? data.cooperators : [];
  data.cooperators = cooperators;
  const current = cooperators.find((item) => item?.member === member);
  if (current) current.authType = projectAuth;
  else cooperators.push({ member, authType: projectAuth });
  return true;
}

// 修改企业接入形态、部署区域和灰度能力。
function applyQuickSystem(data, quick) {
  const preset = CORP_PRESETS[quick.corpPreset];
  if (preset) {
    Object.assign(data, {
      third: preset.third,
      corpType: preset.corpType,
      subCorpType: preset.subCorpType,
      subIntegrated: preset.subIntegrated
    });
    data.config = { ...(isPlainObject(data.config) ? data.config : {}), odmType: preset.odmType };
  }
  if (quick.deployType !== null) data.deployType = quick.deployType;
  if (quick.productEdition !== null) data.productEdition = quick.productEdition;
  if (quick.betaEnabled) data.betaFunc = [...quick.betaFunctions];
}

// 修改版本有效期状态并同步当前商业版本。
function applyQuickVersionStatus(data, quick) {
  const status = {
    normal: { leftDays: 365, trying: false },
    expiring: { leftDays: 0, trying: true },
    trial: { leftDays: 0, trying: false },
    delayed: { leftDays: 1, trying: false },
    expired: { leftDays: -1, trying: false }
  }[quick.versionStatus];
  if (quick.version !== null) data.version = quick.version;
  if (status) Object.assign(data, status);
}

// 修改融合平台的语言、地区格式、主题、水印和加密状态。
function applyQuickPlatform(data, quick) {
  if (quick.locale !== null) data.locale = quick.locale;
  const tenant = isPlainObject(data.tenant) ? data.tenant : {};
  data.tenant = tenant;
  if (quick.timezone !== null) tenant.timezone = { etc: quick.timezone, label: quick.timezone };
  if (quick.timeFormat !== null || quick.weekStart !== null) {
    const region = isPlainObject(tenant.region) ? tenant.region : {};
    tenant.region = region;
    if (quick.timeFormat !== null) {
      region.timeFormat = { ...(isPlainObject(region.timeFormat) ? region.timeFormat : {}), type: quick.timeFormat };
    }
    if (quick.weekStart !== null) region.weekStart = quick.weekStart;
  }
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

// 创建一条与 Method 和 URL 路径绑定的请求体模板。
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

// 创建一条按 Method 和 URL 路径精确匹配的接口过滤项。
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

// 生成忽略协议、域名、端口和查询参数的接口唯一键。
export function buildInterfaceKey(method, url) {
  return `${normalizeMethod(method)}\u0000${normalizeUrlPath(url)}`;
}

// 判断指定 Method 和 URL 路径是否命中持久接口过滤列表。
export function isInterfaceFiltered(filters, method, url) {
  const targetKey = buildInterfaceKey(method, url);
  return (Array.isArray(filters) ? filters : []).some(
    (filter) => buildInterfaceKey(filter?.method, filter?.url) === targetKey
  );
}

// 生成用于互斥启用同接口同方向规则的分组键。
export function buildRuleGroupKey(method, url, stage) {
  return `${buildInterfaceKey(method, url)}\u0000${normalizeStage(stage)}`;
}

// 生成用于保存当前标签页手动拦截开关的唯一键。
export function buildManualKey(method, url, stage) {
  return buildRuleGroupKey(method, url, stage);
}

// 从按时间倒序的实时请求中选出每个 Method 和 URL 路径的最新记录。
export function getLatestRequestIds(requests) {
  const seenKeys = new Set();
  const latestIds = new Set();
  for (const request of Array.isArray(requests) ? requests : []) {
    if (!request?.id) continue;
    const key = buildInterfaceKey(request.method, request.url);
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

// 判断规则是否与指定接口路径和拦截方向匹配。
export function matchesRule(rule, method, url, stage) {
  return Boolean(
    rule
      && buildRuleGroupKey(rule.method, rule.url, rule.stage) === buildRuleGroupKey(method, url, stage)
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
    enabled: Boolean(input.enabled),
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

// 从绝对或相对 URL 中提取用于跨域匹配的路径，并忽略 Query 与 Hash。
function normalizeUrlPath(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    return new URL(text, "https://api-rewriter.invalid").pathname || "/";
  } catch {
    return text.split(/[?#]/, 1)[0];
  }
}

// 将拦截阶段限制为请求或响应。
function normalizeStage(value) {
  return value === INTERCEPT_STAGES.REQUEST || value === INTERCEPT_STAGES.RESPONSE ? value : "";
}

// 从 URL 中识别快捷能力支持的初始化接口。
function getQuickEndpoint(url) {
  const path = normalizeUrlPath(url).replace(/\/$/, "");
  const endpoint = QUICK_ENDPOINTS.find((item) => path.endsWith(item));
  if (endpoint) return endpoint;
  return /\/v2\/platform\/assets\/projects\/[^/]+\/files$/.test(path)
    ? QUICK_PROJECT_FILES_ENDPOINT
    : "";
}

// 将输入限制为非负有限数字。
function normalizeNonNegativeNumber(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

// 将可选值限制为指定枚举，空值表示保持原响应。
function normalizeOptionalEnum(value, allowed) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof allowed[0] === "number" ? Number(value) : value;
  return allowed.includes(normalized) ? normalized : null;
}

// 将浏览器或接口语言代码映射为快捷配置支持的语言。
export function normalizeQuickLocale(value) {
  const locale = String(value ?? "").trim().toLowerCase().replaceAll("-", "_");
  if (QUICK_LOCALES.includes(locale)) return locale;
  if (locale === "zh_hant" || locale.startsWith("zh_tw") || locale.startsWith("zh_hk") || locale.startsWith("zh_mo")) {
    return "zh_tw";
  }
  return QUICK_LOCALES.find((candidate) => candidate.startsWith(`${locale.split("_")[0]}_`)) ?? null;
}

// 仅接受显式布尔值，其他输入表示保持原响应。
function normalizeOptionalBoolean(value) {
  return value === true || value === false ? value : null;
}

// 清理可选文本字段，空文本表示保持原响应。
function nonEmptyNullableString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// 去重并过滤字符串多选项。
function normalizeStringList(values, allowed) {
  return [...new Set(Array.isArray(values) ? values : [])]
    .filter((value) => allowed.includes(value));
}

// 去重并过滤数字多选项。
function normalizeNumberList(values, allowed) {
  return [...new Set(Array.isArray(values) ? values.map(Number) : [])]
    .filter((value) => allowed.includes(value));
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
