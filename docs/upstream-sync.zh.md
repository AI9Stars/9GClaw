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

发布仍通过 Actions 的 **Windows Release** 手动触发，在 Windows 原生 x64 和 ARM64 runner 上构建，使用上海日期与递增版本修订。PR 只在 Windows 检查；没有自动发布、OBS 同步或其他平台打包。
