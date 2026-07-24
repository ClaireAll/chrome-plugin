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
- 模型：默认为 `deepseek-v4-flash`；如果账号使用其他 DeepSeek 兼容模型，请自行修改。
- 每个分块的最大 diff 字符数：默认为 `12000`。
- diff 上下文行数：默认为 `3`。
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

审查内容包括 PR 标题、PR 描述、提交信息、变更文件列表和 diff 分块。扩展会先让 DeepSeek 推断本次变更目的，再重点检查逻辑问题、行为回归、边界情况、API 契约不一致、权限变化和缺失测试。

扩展会在 Chrome 扩展本地存储中保留最近三次审查结果。再次打开同一个 PR 时，会自动恢复最近一次匹配结果，面板中也会显示“最近审查”列表。

扩展只展示审查发现，不会自动发布 PR 评论，也不会修改 Bitbucket 中的任何状态。

## 安全说明

当前版本会将 Token 保存在 Chrome 扩展本地存储中，并由浏览器扩展直接调用 DeepSeek。请仅在可信设备上使用。团队共享场景建议通过服务端代理管理 Token。

如果在 `local-default-settings.js` 中填写了真实 Token 或 API Key，请将整个扩展目录及其压缩包视为包含敏感信息的文件，不要上传、提交或分享。

## 实现说明

- Bitbucket 请求使用 Server/Data Center 风格的 REST 路径：`/rest/api/latest/projects/{projectKey}/repos/{repoSlug}/pull-requests/{id}`。
- DeepSeek 请求通过 `POST /chat/completions` 发起，并要求返回 JSON。
- 较大的 diff 会先拆分为多个分块，再逐块审查。
- 默认审查规则重点关注正确性、行为回归、缺失测试、安全性、性能以及前端特有问题。

## 验证

进入 `bitbucket-pr-ai-reviewer` 目录后运行：

```bash
npm test
npm run check
```
