# 个人插件集合

这个仓库用于存放个人自用的浏览器插件和编辑器辅助工具。每个一级目录通常对应一个可独立加载或调试的插件。

## 插件目录

| 目录 | 插件名 | 类型 | 用途 |
| --- | --- | --- | --- |
| `bitbucket-pr-ai-reviewer` | Bitbucket PR AI Reviewer | Chrome 插件 | 在 `code.fineres.com` 的 Bitbucket Pull Request 页面内打开审查面板，读取 PR 信息、diff 和项目上下文，并调用 DeepSeek 生成带结构化证据的代码审查建议；同时支持从面板打开飞书项目任务。 |
| `feishu-jump` | Feishu Task Jumper | Chrome 插件 | 输入飞书项目任务 key，例如 `f-7028807610`、`m-7040569864` 或纯数字任务号，快速打开对应任务详情页；也支持浏览器地址栏 `fs` 关键字跳转。 |
| `group` | group | Chrome 插件 | 将页面保存到本地分组中，支持分组图标/颜色、快捷固定、内联重命名和批量打开，便于按工作上下文快速恢复一组相关页面。 |
| `style` | Style Inspector | Chrome 插件 | 在任意页面叠加 DOM padding、margin、border、gap、尺寸、字体和颜色标注，支持点击/框选元素、分析自身或内部元素、按配置显示标注，并可点击标签切换右下角详情卡用于视觉验收和样式排查。 |
| `todo` | todo | Chrome 插件 | 在页面上提供可拖拽的悬浮待办列表，支持提醒、颜色标记和本地已完成记录管理。 |
| `i18n-search-helper` | I18n Search Helper | VS Code 插件 | 输入中文文案后读取 `zh_CN.json` 匹配 i18n key，并将 VS Code 搜索词切换为 key，用于查找 `BI.i18nText("...")` 等代码引用。 |
| `task-link` | Task Link | VS Code 插件 | 将 `f-123`、`m-123`、`g-123`、`s-123`、`JSY-123`、`REPORT-123`、`KERNEL-123` 等任务号标注为可打开的任务链接，并兼容 GitLens 与 Git History 的 commit 信息链接显示。 |

## 提交更新说明

每次提交时同步更新本节，补充本次提交的主要变化。说明保持简短，优先记录用户可感知的功能、配置、插件目录变化和重要修复。

格式建议：

```text
- YYYY-MM-DD: 更新内容摘要。
```

### 更新记录

- 2026-08-12: 使用 ponytail 精简 `task-link` 模板替换代码，并清理 `i18n-search-helper` 旧版安装包，仅保留当前 0.1.5 产物。
- 2026-08-11: `todo` 新增工作日、每周、每月定时任务配置，后台按 Chrome alarms 自动生成待办，并优化周完成热力图的任务块展示。
- 2026-08-11: `task-link` 扩展任务号识别范围，支持 `s-`、`REPORT-`、`KERNEL-` 和自定义链接规则，并补充可安装 VSIX/ZIP 产物。
- 2026-08-11: `i18n-search-helper` 升级到 0.1.5，支持启动后自动准备搜索上下文、搜索 key/原文切换命令和按工作区补全 `zh_CN.json` 配置。
- 2026-08-11: `group` 支持将已存在的页面从原分组移动到当前分组，`style` 修正自定义标签尺寸下的标注位置计算，`bitbucket-pr-ai-reviewer` 收紧 memo 与 React Flow 审查规则。
- 2026-08-07: 新增 `task-link`，支持在 VS Code 中打开飞书项目和 JSY 任务号链接，并生成可安装的 VSIX 与 ZIP 产物。
- 2026-07-31: 新增 `i18n-search-helper`，支持输入中文文案后匹配 `zh_CN.json` 中的 i18n key，并在 VS Code 全局搜索或当前文件搜索中切换为 key。
- 2026-07-30: `style` 新增 Style Inspector 插件，支持 DOM 样式标注、点击/框选选择、字体信息、颜色/token 信息、可配置标注颜色和标签详情切换。
- 2026-07-30: `bitbucket-pr-ai-reviewer` 加强 AI 审查证据链，补充项目上下文读取、结构化 finding 证据、旧版审查记录提示，并收窄 diff 上下文配置范围。
- 2026-07-30: `group` 优化浮窗和管理页体验，支持分组图标/颜色、分组按钮选择、页面内联重命名、固定快捷访问和页面移动。
- 2026-07-30: `todo` 新增待办颜色按预设自动轮换，连续新增任务时更容易区分。
- 2026-07-27: `todo` 优化悬浮待办面板视觉、提醒确认、颜色预设、完成记录只读展示和自适应高度。
- 2026-07-27: `group` 补充扩展图标资源和 manifest 图标配置。
- 2026-07-27: `bitbucket-pr-ai-reviewer` 补充本地默认配置示例文件，真实密钥仍保留在被忽略的本地配置中。
- 2026-07-24: `feishu-jump` 支持通过浏览器地址栏 `fs` 关键字输入任务编号并跳转到飞书任务详情。
- 2026-07-24: 新增根目录 README，补充插件用途说明和提交更新说明维护约定。
