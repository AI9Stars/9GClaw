# 上游同步维护

本次同步基线为上游 `2865f05b`，将本仓库原有 8 个品牌、README 和 Windows 发布提交 rebase 到该基线，再补齐新增功能的品牌改动。所有操作都在独立克隆与 `codex/sync-upstream-9gclaw` 分支中进行，不更新上游远端。

## 后续同步

已发布的分支建议通过合并上游并提交 PR 同步，保留分叉仓库的历史，避免强推 `main`。先确认工作区干净并保存当前首页 README，然后执行：

```powershell
git fetch origin main
git fetch upstream main
git switch -c codex/sync-upstream origin/main
git merge --no-commit upstream/main
```

解决冲突时保留上游功能、修复和测试，保留本仓库 README、Logo、身份 prompt 及四个 Windows workflow；不要恢复其他平台打包或 OBS 发布。若确实需要 rebase，始终在独立分支上进行，逐个重放本仓库定制提交，检查最终差异后再交付 PR。

依赖已安装时，用以下工具处理上游新代码中的命名空间，再重新安装以刷新工作区包链接：

```powershell
node scripts/rebrand-tracked-files.mjs
node scripts/rebrand-tracked-files.mjs --apply
pnpm install --frozen-lockfile
git add -A
node scripts/check-branding.mjs
```

重命名工具从本地 `upstream` 远端 URL 推导旧名称，也可以用 `--from <上游项目名>` 指定。它仅处理 Git 跟踪的 UTF-8 文本与文件名；媒体文件保持原样，TypeScript 标识符保留合法的字母开头形式。应用前默认只报告文件数，应用后检查差异。机械替换不能代替界面审查：新增产品文案应使用中文品牌，文件名、路径、环境变量和 HTTP 标识应使用 ASCII。

重点复查 `apps/desktop/src/brand.ts`、`appearance.ts`、`startupStyle.ts`、`ui/src/components/auth/view/StartupFrame.tsx`、`ui/vite.config.js`、`src/context/prompt/productIdentity.ts`、两个包锁文件，以及更新默认仓库。不要整体覆盖新版的启动模板或运行时逻辑。

## 验证

```powershell
pnpm run build
pnpm --filter 9gclaw-desktop run compile
pnpm --filter 9gclaw-desktop run test
node --test packages/config/tests/*.test.cjs scripts/lib/*.test.mjs
node --test dist/tests/context/product-identity.spec.js
pnpm --dir ui run build
pnpm --dir ui run typecheck
node ui/e2e/startup-continuity.smoke.mjs
node scripts/check-branding.mjs
```

发布仍通过 Actions 的 **Windows Release** 手动触发，在 Windows 原生 x64 和 ARM64 runner 上构建，使用上海日期与递增版本修订。PR 在 Windows 执行回归检查并复用 Release 的 x64/ARM64 实际打包；没有自动发布、OBS 同步或其他平台打包。

## Windows 发布与更新补丁

PR #1 已合并，后续修复继续放在原 `codex/sync-upstream-9gclaw` 分支，不新建 PR。
本次 patch 的基线为 `027347f13970578a9c8d5dbcde0312b91e9b95d3`。
首页两份 README 保持原样。后续上游更新时，按以下范围保留定制：

- `.github/workflows/desktop-windows.yml` 是 PR 与 Release 共用的原生 Windows x64/ARM64 打包流程；PR 只上传 artifact。`release.yml` 是唯一发布入口，仅手动从 main 发布 GitHub Release。
- `apps/desktop/package.json` 仅启用 Windows 打包，`win.signExecutable=false` 保留图标和版本资源编辑并禁用签名；`win.verifyUpdateCodeSignature=false` 与无签名发布一致。不要恢复证书、签名环境或签名脚本。
- `ui/server/services/desktopReleaseService.js` 只解析配置仓库的 GitHub Release，保留元数据校验、超时、重试和 payload 校验；不要恢复镜像、OBS、测速或路线缓存。桌面 main 只传 GitHub 所需参数。
- `verify-update-download.cjs` 使用真实 Windows NsisUpdater，覆盖慢速下载、暂停/恢复、取消清理、校验和与 chunked 传输；实际打包验证还会调用 `getNineGClawInstallCommand`。品牌显示文字不可替换函数名中的命名空间；`check-branding.mjs` 会检查这类错误。
- 保留上海日期版本、重试策略、ASCII 路径、中文显示品牌、Logo 和身份 prompt。跨平台共用源码与资源仍保留，当前没有 macOS/Linux 打包目标。

独立导出基于 main 的完整差异，避免把 squash 前的历史提交重复导出：

```powershell
git diff --binary --full-index 027347f13970578a9c8d5dbcde0312b91e9b95d3 HEAD --output=windows-release-github-only.patch
# 包含首次品牌同步与本次修复的完整定制参考，基于本次上游提交：
git diff --binary --full-index 2865f05b1722c7473ea8a9dda317a92fb8c92dd8 HEAD --output=9gclaw-upstream-customizations.patch
# 在已完成上游同步和命名空间替换的新分支上审查、应用；有冲突时逐文件保留上述策略：
git apply --3way windows-release-github-only.patch
pnpm install --frozen-lockfile
node scripts/check-branding.mjs
pnpm --filter 9gclaw-desktop compile
pnpm --filter 9gclaw-desktop test
```

最后运行 Desktop workflow（支持手动触发），确认两种架构实际生成安装包并通过验证。
不要为了测试触发 Release 发布。上游改动较大时，patch 用作审查参考，避免直接覆盖新功能。
