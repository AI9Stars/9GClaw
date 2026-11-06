# Upstream synchronization

Merge upstream into a new branch based on this fork's `main`. Preserve both parent histories; do not rebase shared branches or force-push `main`. Use an isolated checkout and retain the fork's root README files and original media.

```powershell
git fetch origin main
git fetch upstream main
git switch -c codex/sync-upstream origin/main
git merge --no-commit upstream/main
```

Resolve conflicts using current upstream behavior plus the fork's product policy. The namespace tool is a mechanical aid, not a replacement for reviewing changed logic, prompts and release inputs. It defaults to a preview and infers the source name from the `upstream` remote; `--from <name>` works without that remote.

```powershell
node scripts/rebrand-tracked-files.mjs
node scripts/rebrand-tracked-files.mjs --apply
pnpm install --frozen-lockfile
git add -A
node scripts/check-branding.mjs
```

The tool rewrites tracked UTF-8 text and filenames, retaining binary bytes. It preserves legal TypeScript and CSS identifiers. Dot selectors are scanned only in CSS; code contributes explicit `className` values, so environment variables cannot become CSS identifiers. The branding checker intentionally retains the legacy namespace it audits and is excluded from rewriting.

## Fork contracts

- Display the exact Chinese product name **九格智能体平台**, including in English UI and model identity. The short startup wordmark is **九格智能体**. Preserve the original logo and root README content.
- Use `9gclaw`, `@9gclaw/config`, `NINEGCLAW_*`, and legal `NineGClaw`/`ninegclaw` code identifiers. Programs, installer names and default directories use ASCII. See [branding](9gclaw-branding.md) for data paths.
- Keep the identity block in default and custom prompts and built-in subagents. Preserve the current upstream tool, context, permission and delegation instructions. Identity does not change the active model/provider description.
- Keep only the four Windows workflows. PRs run regressions and native x64/ARM64 packaging; the manual Windows Release entry point is the only publisher. Preserve Shanghai-date versions, bounded retries and unsigned packaging with checksum verification.
- Keep GitHub-only desktop updates from `AI9Stars/9GClaw`, including metadata/payload validation, cancellation, pause/resume and runtime recovery. Do not restore OBS routes, mirrors, signing secrets or other platform release jobs.
- Carry forward upstream fixes and regression coverage, including new runtime skills and test/build inputs. Accept upstream documentation consolidation without restoring obsolete task reports.

Review `src/context/prompt/productIdentity.ts`, `PromptAssembler.ts`, built-in subagent prompts, runtime skills, desktop `brand.ts`/startup templates, React/Web startup, favicon/PWA assets, both lockfiles and update defaults. Binary logos need an explicit check: renaming a new upstream image does not rebrand its pixels.

## Validation

```powershell
pnpm run build
node --test dist/tests/context/product-identity.spec.js
pnpm run test:mcp
pnpm run test:checkpoints
pnpm --filter 9gclaw-desktop compile
pnpm --filter 9gclaw-desktop test
node --test packages/config/tests/*.test.cjs scripts/lib/*.test.mjs scripts/rebrand-tracked-files.test.mjs
pnpm --dir ui typecheck
pnpm --dir ui test
pnpm --dir ui build
node ui/e2e/startup-continuity.smoke.mjs
node scripts/check-branding.mjs
node scripts/rebrand-tracked-files.mjs
```

The final rewrite preview should report zero pending files. Verify root README and original-logo blob hashes against fork `main`. Review the diff against upstream as well as against the fork; this catches accidentally discarded upstream behavior. Record actual results and platform limits in the PR, with temporary evidence under ignored `artifacts/` or `outputs/`.

Run the Desktop workflow to validate native Windows x64 and ARM64 packages. Do not trigger a Release merely to test a sync. Merge with a merge commit so the next sync retains a common upstream ancestor.
