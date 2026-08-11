# Bitbucket PR AI Reviewer

这是一个 Chrome Manifest V3 扩展，用于调用 DeepSeek 审查 Bitbucket Server/Data Center 上的 Pull Request。默认适配 `https://code.fineres.com`。

## 安装

1. 进入 `bitbucket-pr-ai-reviewer` 目录，复制本地配置模板：

   ```bash
   cp local-default-settings.example.js local-default-settings.js
   ```

2. 按需编辑 `local-default-settings.js`。至少需要填写：

   - `bitbucketToken`：可读取目标仓库和 Pull Request 的 Bitbucket Token。
   - `deepseekApiKey`：调用 DeepSeek API 使用的密钥。

3. 在 Chrome 中打开 `chrome://extensions`。
4. 开启右上角的“开发者模式”。
5. 点击“加载已解压的扩展程序”。
6. 选择 `bitbucket-pr-ai-reviewer` 目录。
7. 如需调整配置，也可以打开扩展的选项页面进行设置。

## 配置

- 本地默认配置：`local-default-settings.js`。该文件已被 Git 忽略，每位使用者应从 example 文件复制后填写自己的配置。
- Bitbucket 地址：默认为 `https://code.fineres.com`。
- Bitbucket Token：必须具有读取目标仓库和 Pull Request 的权限。
- 认证方式：默认使用 `Bearer`；仅当 Bitbucket 实例要求时改用 `Basic`。
- DeepSeek 地址：默认为 `https://api.deepseek.com`。
- DeepSeek API Key：由扩展后台 Service Worker 直接用于调用 DeepSeek。
- 模型：默认为 `deepseek-v4-pro`；旧版本已保存的 `deepseek-v4-flash` 会在读取配置时自动迁移到 `deepseek-v4-pro`，如果账号使用其他 DeepSeek 兼容模型，请自行修改。
- 每个分块的最大 diff 字符数：默认为 `8000`，审查运行时也会把旧的大配置收敛到不超过 `8000`。
- diff 上下文行数：默认为 `8`，用于给改动行补充邻近上下文；可在 `0` 到 `8` 之间调整。旧版本保存的 `1000` 以上配置会自动按新版默认值处理，避免一行改动在大文件中膨胀成大量 AI 分块。
- 审查规则：会追加到默认审查提示词中，可参考 `REVIEW_RULES.md` 中可直接复制的规则模板。

不要使用 `git add -f` 强制添加 `local-default-settings.js`。仓库中只应提交密钥为空字符串的 `local-default-settings.example.js`。

## 使用

1. 打开 Bitbucket Pull Request 页面，例如：

   ```text
   https://code.fineres.com/projects/FX/repos/fx-data-web/pull-requests/123/overview
   ```

2. 将蓝色 AI 悬浮球拖动到合适位置。
3. 点击悬浮球打开审查面板。
4. 点击“审查 PR”。
5. 在面板中查看紧急问题和改进建议。

## 组件规范审查

当 PR 属于 `FX/fx-data-web` 或 `FX/fine-design-biz` 时，扩展会根据 diff 中出现的 JSX 组件名，优先从 `FX/fine-design` 仓库读取匹配组件源码片段，作为 AI 审查时的组件 API 参考。

这类上下文用于发现组件使用不规范的问题，例如 `Instruction` 组件如果已经支持传入图标相关属性，就应提示不要把图标 JSX 拼进 `message`，而是使用组件自身的图标属性，并让 `message` 只承载文本内容。

## 图片反馈

完成一次评审后，可以在两处向 AI 提供图片上下文：

- 点击单条审核意见右上角的“反馈”，让 AI 结合图片重新判断该意见。
- 点击详情底部的“补充审查”，让 AI 结合图片重新检查整个 PR。

两种反馈都支持以下添加方式：

- 点击“添加图片”选择本地文件。
- 将图片拖入附件区域。
- 在反馈输入框中直接粘贴剪贴板图片。

图片仅支持 PNG、JPEG 和 WebP，单次最多 3 张；扩展会把图片最长边缩放到不超过 1600px，并将单张压缩到 2MB 以内。每张缩略图都可以在提交前单独移除。

图片不能代替文字反馈。提交时仍需说明希望 AI 重新判断或重点检查的内容，方便在历史记录中保留可追溯的反馈意图。

图片会随当前请求发送到“设置”页面中配置的 AI 服务，因此所选模型必须支持视觉输入。如果模型不支持图片，扩展会提示更换支持视觉输入的模型。

图片只保存在当前页面内存中，不会写入 Chrome 扩展本地存储、IndexedDB 或评审历史。提交成功、取消或关闭反馈框、关闭评审面板以及切换 PR 页面时，扩展会释放图片；请求失败时会暂时保留，便于修改后重试。

审查内容包括 PR 标题、PR 描述、提交信息、变更文件列表、展开上下文后的非测试/非 Markdown 文件 diff 分块，以及从变更符号推导出的项目上下文片段。扩展会跳过 `test.ts`、`*.test.ts`、`*.spec.ts`、`test`、`tests`、`__tests__` 目录下的测试文件改动，以及 `.md` 文档文件改动，不会把这些文件作为 AI finding 的目标；`.json` 文件只保留本次增删的 key/value 进入 AI 审查。扩展会先让 DeepSeek 推断本次变更目的，再重点检查逻辑问题、行为回归、边界情况、API 契约不一致、权限变化和缺失测试。每条 finding 会要求模型输出结构化代码依据，包括改动证据、触发条件、调用链/数据流和反证检查，减少只有猜测没有依据的结果。

扩展会在 Chrome 扩展本地存储中保留最近三次审查结果。再次打开同一个 PR 时，会自动恢复最近一次匹配结果，面板中也会显示“最近审查”列表。评审规则升级后，旧版记录会标记为“旧版规则”，建议重新审查以生成最新证据结构。

扩展只展示审查发现，不会自动发布 PR 评论，也不会修改 Bitbucket 中的任何状态。

## 安全说明

当前版本会将 Token 保存在 Chrome 扩展本地存储中，并由浏览器扩展直接调用 DeepSeek。请仅在可信设备上使用。团队共享场景建议通过服务端代理管理 Token。

如果在 `local-default-settings.js` 中填写了真实 Token 或 API Key，请将整个扩展目录及其压缩包视为包含敏感信息的文件，不要上传、提交或分享。

## 实现说明

- Bitbucket 请求使用 Server/Data Center 风格的 REST 路径：`/rest/api/latest/projects/{projectKey}/repos/{repoSlug}/pull-requests/{id}`。
- 审查前会根据 diff 和变更文件抽取函数、组件、hook、类型、常量等符号，并从当前仓库读取路径匹配的定义、调用或示例片段作为项目知识上下文。
- 对 `fx-data-web` 和 `fine-design-biz` 的 PR，扩展会额外按需读取 `FX/fine-design` 中的组件源码片段，读取失败不会阻断本次审查。
- DeepSeek 请求通过 `POST /chat/completions` 发起，并要求返回带结构化证据字段的 JSON；扩展不主动设置 `max_tokens` 输出上限，单次请求等待超过 5 分钟会停止并提示错误。
- 每个 diff 分块等待 DeepSeek 返回期间会每 30 秒刷新一次进度，避免界面停留在旧状态看起来像卡死。
- 每个 diff 分块默认只调用一次 DeepSeek，减少大 PR 的请求量，也避免候选问题在二次复核中被过度删除。
- 单个 diff 分块请求失败时会记录失败片段并继续审查后续片段，最终保留已完成片段的结果。
- 评审文案内置 human-writing 风格约束：像给 PR 作者留言一样写，保留 diff/context 支撑的事实，避免“建议确认”“需要注意”这类 AI 套话。
- 评审结果默认展示“问题”和“建议”，代码依据折叠显示，减少证据字段直接堆在卡片里造成的阅读负担。
- 较大的 diff 会先拆分为多个分块，再逐块审查；超大单文件 diff 会过滤掉没有实际 `+/-` 改动的纯上下文分块，并压缩源码参考片段以减少单次 DeepSeek 请求体积。
- 默认审查规则重点关注正确性、行为回归、缺失测试、安全性、性能以及前端特有问题。

## 验证

进入 `bitbucket-pr-ai-reviewer` 目录后运行：

```bash
npm run check
```
