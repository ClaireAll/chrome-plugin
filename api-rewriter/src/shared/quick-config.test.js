import assert from "node:assert/strict";
import test from "node:test";
import * as quickDomain from "./domain.js";
import {
  applyQuickConfig,
  createDefaultQuickConfig,
  normalizeQuickConfig
} from "./domain.js";

test("快捷配置会跨域修改初始化接口且不会改变输入对象", () => {
  const source = {
    data: {
      role: 2,
      groupRole: 1,
      policy: [],
      publishAuth: false,
      platformRole: -1
    }
  };
  const config = normalizeQuickConfig({
    ...createDefaultQuickConfig(),
    enabled: true,
    role: 0,
    groupRole: 0,
    publishAuth: true
  });

  const result = applyQuickConfig(
    source,
    config,
    "GET",
    "https://dev.jiushuyun.com/decision/v1/user/info?from=test",
    "response"
  );

  assert.deepEqual(result.value.data, {
    role: 0,
    groupRole: 0,
    policy: [],
    publishAuth: true,
    platformRole: -1
  });
  assert.equal(result.applied, true);
  assert.equal(source.data.role, 2);
});

test("接口记录开启后无需独立开关即可应用快捷配置", () => {
  const result = applyQuickConfig(
    { data: { role: 2 } },
    normalizeQuickConfig({ role: 0 }),
    "GET",
    "/decision/v1/user/info",
    "response"
  );

  assert.equal(result.applied, true);
  assert.equal(result.value.data.role, 0);
});

test("核心快捷配置会组合修改企业、版本、语言和计算资源", () => {
  const config = normalizeQuickConfig({
    enabled: true,
    role: 0,
    corpPreset: "lark",
    version: "Hi01000",
    locale: "ja_jp",
    maxRowSize: 5000,
    maxMemPerTaskMB: 8192,
    highPerformance: true
  });

  const system = applyQuickConfig(
    { data: { third: false, corpType: 0, config: { odmType: "none" } } },
    config,
    "GET",
    "https://test.jiushuyun.com/decision/v1/system/info",
    "response"
  ).value;
  const version = applyQuickConfig({ data: "Hi03000" }, config, "GET", "/decision/v1/version", "response").value;
  const resource = applyQuickConfig(
    { data: { maxRowSize: 100, maxMemPerTaskMB: 1024, highPerformance: false } },
    config,
    "GET",
    "/decision/v1/version/resource",
    "response"
  ).value;
  const locale = applyQuickConfig(
    { data: { locale: "zh_cn", member: { memberId: "1" } } },
    config,
    "GET",
    "/decision/v1/user/platform-info",
    "response"
  ).value;

  assert.deepEqual(system.data, {
    third: true,
    corpType: 24,
    subCorpType: "Default",
    subIntegrated: false,
    config: { odmType: "none" }
  });
  assert.equal(version.data, "Hi01000");
  assert.deepEqual(resource.data, {
    maxRowSize: 5000,
    maxMemPerTaskMB: 8192,
    highPerformance: true
  });
  assert.equal(locale.data.locale, "ja_jp");
});

test("查看者预设会清除与查看身份冲突的管理员权限", () => {
  const source = {
    data: {
      role: 0,
      groupRole: 0,
      platformRole: 0,
      publishAuth: true,
      portalRole: 4,
      policy: [
        { action: "memberManager", effect: "allow", resource: "all" },
        { action: "export", effect: "allow", resource: "all" }
      ]
    }
  };
  const config = normalizeQuickConfig({ enabled: true, role: 2, corpPreset: "fusion" });

  const result = applyQuickConfig(source, config, "GET", "/decision/v1/user/info", "response");

  assert.deepEqual(result.value.data, {
    role: 2,
    groupRole: 1,
    platformRole: -1,
    publishAuth: false,
    portalRole: 0,
    policy: [{ action: "export", effect: "allow", resource: "all" }]
  });
});

test("查看者预设会同步覆盖项目路由切换返回的企业身份", () => {
  const source = { data: { corpRole: 0, groupRole: 0, groupId: "space-1" } };
  const config = normalizeQuickConfig({ enabled: true, role: 2 });

  const result = applyQuickConfig(
    source,
    config,
    "POST",
    "/decision/v1/group/switch/shorturl?route=/home/project/project-1/workflow",
    "response"
  );

  assert.equal(result.applied, true);
  assert.deepEqual(result.value.data, { corpRole: 2, groupRole: 1, groupId: "space-1" });
});

test("当前组合只返回相对默认值发生修改的快捷配置项", () => {
  const config = normalizeQuickConfig({
    ...createDefaultQuickConfig(),
    enabled: true,
    role: 2,
    maxRowSize: 12000,
    portalEnabled: false
  });

  assert.deepEqual(quickDomain.getQuickConfigChanges?.(config), ["role", "maxRowSize", "portalEnabled"]);
});

test("选择值与接口原值相同时不生成快捷覆盖", () => {
  const config = normalizeQuickConfig(
    { role: 5, corpPreset: "lark" },
    { role: 5, corpPreset: "normal" }
  );

  assert.equal(config.role, null);
  assert.equal(config.corpPreset, "lark");
  assert.deepEqual(quickDomain.getQuickConfigChanges(config), ["corpPreset"]);
});

test("project permission rewrites only the current user's project cooperator", () => {
  const source = {
    data: {
      id: "project-1",
      cooperators: [
        { member: "user-1", authType: "view" },
        { member: "user-2", authType: "edit" }
      ]
    }
  };
  const config = normalizeQuickConfig({ enabled: true, projectAuth: "manager" });

  const result = applyQuickConfig(
    source,
    config,
    "GET",
    "https://dev.jiushuyun.com/decision/v2/platform/assets/projects/project-1/files?edit=true",
    "response",
    { userId: "user-1" }
  );

  assert.equal(result.applied, true);
  assert.deepEqual(result.value.data.cooperators, [
    { member: "user-1", authType: "manager" },
    { member: "user-2", authType: "edit" }
  ]);
  assert.equal(source.data.cooperators[0].authType, "view");
});

test("project response stays untouched until a project permission is selected", () => {
  const source = { data: { id: "project-1", cooperators: [] } };
  const config = normalizeQuickConfig({ enabled: true });

  const result = applyQuickConfig(
    source,
    config,
    "GET",
    "/decision/v2/platform/assets/projects/project-1/files?edit=true",
    "response",
    { userId: "user-1" }
  );

  assert.equal(result.applied, false);
  assert.equal(result.value, source);
});

test("a reset quick config does not overwrite backend defaults", () => {
  const config = normalizeQuickConfig(createDefaultQuickConfig());
  const cases = [
    ["GET", "/decision/v1/user/info", { data: { role: 1, groupRole: 0 } }],
    ["GET", "/decision/v1/system/info", { data: { corpType: 23, third: true } }],
    ["GET", "/decision/v1/version", { data: "Hi04000" }],
    ["GET", "/decision/v1/version/resource", { data: { maxRowSize: 20000, highPerformance: false } }],
    ["GET", "/decision/v1/user/platform-info", { data: { locale: "en_us" } }]
  ];

  for (const [method, url, source] of cases) {
    const result = applyQuickConfig(source, config, method, url, "response");
    assert.equal(result.applied, false, url);
    assert.equal(result.value, source, url);
  }
});

test("旧版自动预设会迁移为不覆盖接口原值", () => {
  const data = quickDomain.normalizeData({
    version: 4,
    quickConfig: {
      enabled: true,
      role: 0,
      corpPreset: "lark",
      version: "Hi01000",
      locale: "zh_cn",
      maxRowSize: 5000,
      maxMemPerTaskMB: 8192,
      highPerformance: true
    }
  });

  assert.deepEqual(quickDomain.getQuickConfigChanges(data.quickConfig), []);
});

test("detects the original user role before quick overrides", () => {
  const detected = quickDomain.detectQuickOriginalValues?.(
    { data: { userId: "user-1", role: 5 } },
    "GET",
    "/decision/v1/user/info",
    "response"
  );

  assert.deepEqual(detected, { role: 5 });
});

test("all quick response endpoints can be collected before an override is selected", () => {
  const endpoints = [
    "/decision/v1/version",
    "/decision/v1/version/resource",
    "/decision/v1/user/platform-info",
    "/decision/v1/corp/platform-config",
    "/decision/v2/platform/assets/projects/project-1/files"
  ];

  for (const url of endpoints) {
    assert.equal(quickDomain.matchesQuickDetection?.("GET", url, "response"), true, url);
  }
});

test("detects the original supplemental identity values", () => {
  const detected = quickDomain.detectQuickOriginalValues?.(
    {
      data: {
        userId: "user-1",
        role: 5,
        groupRole: 0,
        platformRole: 0,
        publishAuth: true,
        portalRole: 4
      }
    },
    "GET",
    "/decision/v1/user/info",
    "response"
  );

  assert.deepEqual(detected, {
    role: 5,
    groupRole: 0,
    platformRole: 0,
    publishAuth: true,
    removeCaseAuth: true
  });
});

test("detects the current user's original project permission", () => {
  const detected = quickDomain.detectQuickOriginalValues?.(
    {
      data: {
        id: "project-1",
        cooperators: [
          { member: "user-1", authType: "view" },
          { member: "user-2", authType: "edit" }
        ]
      }
    },
    "GET",
    "/decision/v2/platform/assets/projects/project-1/files",
    "response",
    { userId: "user-1" }
  );

  assert.deepEqual(detected, { projectAuth: "view" });
});

test("detects the original enterprise type before quick overrides", () => {
  const detected = quickDomain.detectQuickOriginalValues?.(
    { data: { third: true, corpType: 23, subIntegrated: true, config: { odmType: "jdy" } } },
    "GET",
    "https://test.jiushuyun.com/decision/v1/system/info",
    "response"
  );

  assert.deepEqual(detected, { corpPreset: "fusion" });
});

test("已移除的企业外观配置不会继续改写接口", () => {
  const source = {
    data: {
      tenant: {
        corpTheme: { enabled: false, color: "blue" },
        watermark: { enabled: false, color: "normal", density: "normal" },
        isISVEncrypted: false
      }
    }
  };
  const result = applyQuickConfig(
    source,
    normalizeQuickConfig({
      enabled: true,
      themeEnabled: true,
      themeColor: "red",
      watermarkEnabled: true,
      watermarkColor: "deep",
      watermarkDensity: "dense",
      isISVEncrypted: true
    }),
    "GET",
    "/decision/v1/corp/platform-config",
    "response"
  );

  assert.equal(result.applied, false);
  assert.deepEqual(result.value, source);
});

test("detects the original platform region values before quick overrides", () => {
  const detected = quickDomain.detectQuickOriginalValues?.(
    {
      data: {
        tenant: {
          timezone: { etc: "Asia/Tokyo", label: "日本標準時" },
          region: { timeFormat: { type: "H12" }, weekStart: "Sun" }
        }
      }
    },
    "GET",
    "/decision/v1/corp/platform-config",
    "response"
  );

  assert.deepEqual(detected, {
    timezone: "Asia/Tokyo",
    timeFormat: "H12",
    weekStart: "Sun"
  });
});

test("从系统信息接口识别已有灰度能力", () => {
  const detected = quickDomain.detectQuickOriginalValues?.(
    {
      data: {
        third: false,
        corpType: 0,
        betaFunc: [0, 12, 27, 9999],
        deployType: "private-cloud",
        productEdition: "international"
      }
    },
    "GET",
    "/decision/v1/system/info",
    "response"
  );

  assert.deepEqual(detected, {
    corpPreset: "normal",
    betaFunctions: [0, 12, 27],
    deployType: "private-cloud",
    productEdition: "international"
  });
});

test("maps the browser language to a supported quick locale", () => {
  assert.equal(quickDomain.normalizeQuickLocale?.("zh-CN"), "zh_cn");
  assert.equal(quickDomain.normalizeQuickLocale?.("en-GB"), "en_us");
});

test("识别核心快捷配置的接口原值", () => {
  const originalValues = Object.assign(
    {},
    quickDomain.detectQuickOriginalValues(
      { data: "Hi03000" }, "GET", "/decision/v1/version", "response"
    ),
    quickDomain.detectQuickOriginalValues(
      { data: { locale: "ja_jp" } }, "GET", "/decision/v1/user/platform-info", "response"
    ),
    quickDomain.detectQuickOriginalValues(
      { data: { maxRowSize: 20000, maxMemPerTaskMB: 16384, highPerformance: false } },
      "GET",
      "/decision/v1/version/resource",
      "response"
    )
  );

  assert.deepEqual(originalValues, {
    version: "Hi03000",
    locale: "ja_jp",
    maxRowSize: 20000,
    maxMemPerTaskMB: 16384,
    highPerformance: false
  });
});
