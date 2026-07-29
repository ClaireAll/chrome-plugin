# Code Review Rules

这个文件用于维护 PR AI Review 的规则。你可以把下面任意一段复制到插件 Options 页的 `Review rules` 输入框，或者复制到 `src/local-default-settings.js` 的 `reviewRules` 字段里。

## 推荐默认规则

```text
请以资深代码审查者的角度审查当前 Pull Request diff，只输出有行动价值的问题。

优先级：
1. 必须优先发现 correctness bug、运行时异常、数据丢失、权限/安全风险、接口契约不一致、状态流转错误、边界条件错误。
2. 对用户可见行为变更，必须检查是否缺少必要测试或回归验证。
3. 前端文件（JS/TS/TSX/Vue/CSS/Less）重点检查渲染条件、状态同步、异步请求竞态、表单校验、空数据状态、权限按钮、可访问性、样式回归。
4. 性能问题只在会造成明显重复请求、重复渲染、大列表卡顿、内存泄漏或阻塞交互时提出。
5. 不要提出纯格式化、命名偏好、无实际影响的风格建议。

输出要求：
- 每条问题必须包含文件路径。
- 如果 diff 中能判断行号，请给出行号；无法判断则使用 null。
- 除代码片段、文件路径、变量名、函数名、API 名、组件名、库名、命令名、专有名词外，`title`、`detail`、`suggestion` 等审查说明统一使用 UTF-8 简体中文输出。
- 用中文说明为什么这是问题，以及具体怎么修。
- 不审查测试文件自身的 diff，例如 `test.ts`、`*.test.ts`、`*.spec.ts`，以及 `test`、`tests`、`__tests__` 目录下的文件；不要为这些文件输出 finding。
- 减少“可能导致”“可能存在”这类猜测型结论；每条问题必须给出由当前 diff 推导出的依据，例如变更后的条件分支、数据流、调用链、接口契约或状态流转如何触发具体逻辑错误。证据不足时不要输出。
- 如果没有发现问题，返回空 findings。
```

## 更严格的前端规则

```text
请重点审查前端变更，尤其是 React、TypeScript、Vue、样式和接口调用。

必须检查：
1. 是否存在 useEffect 依赖错误、闭包旧值、重复请求、未清理订阅或定时器。
2. 是否存在状态来源混乱、props 与本地 state 不同步、受控/非受控表单混用。
3. 是否存在接口字段变更但类型、空值处理、错误态、loading 态没有同步更新。
4. 是否存在权限、禁用态、提交防重、批量操作、分页筛选条件丢失等业务问题。
5. 是否存在文本溢出、按钮拥挤、移动端布局错位、主题色不一致或可访问性退化。
6. 是否缺少关键路径测试、交互回归说明或边界条件验证。

不要输出：
- 只关于代码风格、空行、import 排序的建议。
- 没有明确风险的“可以考虑”类建议。
- 测试文件自身改动的审查意见，例如 `test.ts`、`*.test.ts`、`*.spec.ts` 或 `__tests__` 下的文件。
```

## 业务逻辑规则模板

```text
请优先审查业务逻辑是否正确。

重点关注：
1. 数据查询条件、筛选条件、排序、分页、权限范围是否和旧逻辑一致。
2. 新增字段是否在创建、编辑、详情、列表、导出、校验、权限判断中都处理完整。
3. 异常分支、空数据、接口失败、部分成功、重复提交、并发更新是否安全。
4. 是否有跨模块契约变化但调用方未同步。
5. 是否存在静默失败、吞掉错误、只在 happy path 工作的问题。
```

## 安全规则模板

```text
请重点审查安全和权限风险。

必须检查：
1. token、密钥、用户隐私数据是否被写入前端代码、日志、URL、错误提示或持久化存储。
2. 权限校验是否只在前端完成，是否存在越权操作入口。
3. 用户输入是否可能造成 XSS、注入、路径穿越、不安全跳转。
4. 文件上传、下载、预览、导入导出是否限制类型、大小和权限范围。
5. 错误信息是否暴露内部实现、接口地址、堆栈或敏感字段。
```

## fx-data-web 专用规则

下面这组规则根据 `D:\work\fv-web2` 的项目文档整理，适合直接复制到插件 Options 页的 `Review rules`，用于 review `fx-data-web / fv-web2` 的 PR。

```text
请按 fx-data-web 项目规范审查当前 Pull Request diff。只输出明确、可行动、和当前 diff 相关的问题。

输出语言：
1. 除代码片段、文件路径、变量名、函数名、API 名、组件名、库名、命令名、专有名词外，所有审查说明必须使用 UTF-8 简体中文。
2. 不要把 React、TypeScript、FineUI、FineDesign、DeepSeek、Bitbucket、@jsy/core、@fx-ui/fine-design、useEffect、PageProvider、FINEUI_TO_FD_KEY 等专有名词硬翻译成中文。
3. JSON 字段名保持英文，例如 severity、filePath、line、title、detail、suggestion；字段值里的说明文字按上面的中文规则输出。

证据要求：
1. 减少“可能导致”“可能存在”“建议确认”这类猜测型 review；只有能从当前 diff、PR 标题/描述、commit message、组件源码或已有上下文推导出具体失败路径时才输出。
2. 每条问题的 detail 必须说明触发条件和逻辑依据，例如哪段改动改变了条件分支、数据结构、调用链、接口契约、状态流转或渲染结果，以及为什么会产生实际错误。
3. 如果只是缺少上下文、不了解项目约定或无法证明会出错，不要输出 finding；可以保持空 findings。
4. 不审查测试文件自身的 diff，例如 `test.ts`、`*.test.ts`、`*.spec.ts`，以及 `test`、`tests`、`__tests__` 目录下的文件；不要为这些文件输出 finding。

变更安全：
1. 检查改动是否保持最小范围，是否顺手重构、顺手清理、修改了与需求无关的文件或逻辑。
2. 修改 @jsy/core、共享服务、共享类型、工具函数、公共组件时，必须指出可能受影响的消费方或缺失的兼容性检查。
3. 新增功能前应优先复用 @jsy/core 或同 package 内已有实现；发现跨包重复造轮子、重复封装工具、重复业务组件时提出。
4. 新增第三方依赖、复杂抽象或未来预留能力时，若当前需求没有明确必要性，应标为问题。

类型安全与错误处理：
1. 新代码禁止 any、@ts-ignore、@ts-nocheck；触碰旧代码时应尽量收窄 any 或移除 ts-ignore，但不要要求一次性改完无关文件。
2. catch 块不能静默吞异常；必须记录、转换为用户可感知错误，或继续上抛。
3. 新增类型和新增方法必须有简短用途注释，说明它解决什么问题或服务什么调用方。
4. 命名应自解释；如果变量、函数、组件名无法表达业务含义，或注释在替代清晰命名，需要指出。

import、模块初始化和包入口：
1. 禁止在模块顶层调用 System.getInstance()、UserService.getInstance()，或任何最终访问它们的函数；应改为函数内懒加载、getter、init 后或组件 mount 后计算。
2. 轻量页、MPA 入口、登录、邀请、错误页等场景禁止从 @jsy/core 或 @jsy/web-react 根路径导入。
3. 单个 API、工具、类型应使用 @jsy/core/lib/... 具体子路径；页面级符号用 @jsy/web-react/pages；单个组件用组件文件路径。
4. 不要在 jsy-web-react/src/main.ts、jsy-core/lib/index.ts 或业务桶里新增会拉起重模块的 barrel re-export。
5. jsy-core 包内避免 from '../crud'、from '../service' 等桶路径，优先改成具体子路径。
6. 纯函数文件（校验、格式化等）顶层不应 import conf.crud、整棵 router 或重业务模块。
7. 不要审查 `BI.i18nText` 的缺少 `BI` 对象导入问题；它是翻译函数，不参与业务逻辑，不要仅因此报错。
8. 需要审查除 `BI.i18nText` 外的 `BI.xxx` 通用工具方法使用；如果存在 lodash 中明确对应的方法，建议改用 lodash 对应方法，不要再新增 `BI.xxx` 工具方法调用。
9. 不要提出“使用 Tailwind 类名可能无效”这类审查；本工程 Tailwind 类名默认有效。除非 diff 中能明确证明样式冲突、布局异常或类名拼接逻辑错误，否则不要质疑 Tailwind 类名有效性。

Provider 和轻量入口：
1. 登录、邀请、错误页等轻量页应使用 LoginPageProvider，或仅使用 ConfigProvider + locale。
2. 一般 React 页使用 PageProvider；需要 platform-sdk 或平台主题时使用 PlatformPageProvider。
3. 禁止在 PageProvider.tsx 顶层 import platform-sdk、finemirror 等重模块；平台能力应放进独立 PlatformPageProvider 之类文件。
4. initI18n / initHtmlEnv 在轻量页默认 needFvs: false；不要在模块顶层 import '@vinci/core'，需要时动态 import 并显式 needVinci: true。
5. locale 优先 @core/locale，避免经 @core/react 间接拉到 PageProvider。

状态与 React 逻辑：
1. 新代码不应新增 window.BI / window.HI 等全局状态；服务端状态优先 React Query，应用配置优先 React Context。
2. 检查 useEffect 依赖、闭包旧值、异步竞态、重复请求、未清理订阅/定时器、props 与 state 不同步。
3. 组件、函数、文件应保持单一职责；超过约 300 行或同时承担多个职责时，提出拆分建议，但不要要求无关大重构。
4. 关键业务状态变化应可追踪，避免在多个回调里重复写同一份状态。

样式、className 和布局：
1. 复杂 className 拼接优先使用 cn()，导入路径为 @jsy/core/lib/utils/style；数组 join、模板字符串和字符串拼接要检查是否可安全转换。
2. 简单静态 className 不需要强行改 cn。
3. 样式优先 Tailwind；只有动画、复杂选择器、媒体查询等 Tailwind 难表达时再使用 Less。
4. 文本溢出、按钮拥挤、移动端布局错位、主题色不一致、空态/加载态覆盖层层级错误都应指出。

FineUI 到 FineDesign / React 迁移：
1. 不要凭空假设 @fx-ui/fine-design 存在布局组件；FD 只有 Button、Select、Alert、Message、Dialog、Tooltip、Menu、PopConfirm、Form、Input、Pagination 等业务组件，布局用 HTML div + Tailwind。
2. 新迁移不要从 @fui/core 引入 VTapeLayout、DefaultLayout、AbsoluteLayout 等旧布局；这些应由 Tailwind 布局替代。
3. Button、Message、Alert、PopConfirm、NameIcon、Loading 等迁移要符合项目已有映射；不要回退到原生 button 或自造 icon。
4. Pagination 必须使用 FineDesign 的 page、count、size、onPageChange，不要误用 AntD 的 current、total、pageSize、onChange。
5. 迁移时优先保留旧文件并通过 FINEUI_TO_FD_KEY + getFineuiToFdFlag(...) 切换引用，避免直接删除旧实现导致回滚困难。
6. 迁移前要核验旧逻辑是否仍会触发；确认不可达的历史残留可以跳过，不要凭猜想补齐旧逻辑。
7. FD -> FineUI -> FD 或 FineUI -> FD -> FineUI 的夹心结构要谨慎，若需要扩大替换范围，应说明风险。
8. React 组件负责业务逻辑和 UI；桥接层只连接 Model、创建 subOperators；旧 Model 默认保持不动。
9. FineUI Model 的 computed 必须有安全检查和默认值；render 首次可能为空的数据要用 watch + populate 更新 React 组件。

测试、验证和命令：
1. 涉及行为变化、接口契约、状态流转、权限、迁移开关、核心工具函数时，应检查是否有 Vitest 单测或明确回归验证。
2. 可以判断业务改动是否缺少测试覆盖，但不要审查测试文件自身的实现改动。
3. 代码质量命令应优先使用 package.json 中已有 pnpm scripts，不要手动拼临时命令。
4. ESLint 检查尽量使用 pnpm eslint:files <path> 指定文件，避免不必要的全仓检查。
5. Less 改动应考虑 stylelint；格式化遵循 Prettier：160 字符宽度、单引号、trailingComma: all。

安全和本地调试：
1. 不得提交真实 token、Cookie、fine_auth_token、DEV_SID、.env.local 或任何含真实账号信息的配置。
2. test-iam 联调场景不要调用本地 /v1/login/password 覆盖线上复制的 Cookie；应走 login/check 做登录态校验。
3. 本地调试日志、__DEV__ 开关、埋点调试只能用于开发环境，不应泄漏到生产默认行为。
```

## 如何写到本地默认配置

在 `src/local-default-settings.js` 中，把规则写到 `reviewRules`：

```js
reviewRules: `请以资深代码审查者的角度审查当前 Pull Request diff。
优先发现 correctness bug、业务回归、安全风险、缺少测试的问题。
不要提出纯格式化建议。`;
```

注意：如果你已经在 Chrome Options 页保存过规则，Options 页保存的值会覆盖代码里的默认值。需要重新使用代码默认值时，可以在 Options 页点 `Reset defaults`。
