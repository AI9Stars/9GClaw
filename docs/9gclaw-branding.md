# 九格智能体平台 branding

The public product name is **九格智能体平台** in every UI language. Native, Web and React startup screens use the short wordmark **九格智能体** beside the existing logo, retaining the shared continuous progress animation in light, dark and reduced-motion modes.

## Identity and assets

The primary identity prompt is `src/context/prompt/productIdentity.ts`. Default prompts, custom task roles and built-in subagents retain that identity. Historical conversations, summaries and memories do not change the platform name. Model/provider answers use active runtime context and must not claim the platform developed the underlying model.

Branding covers titles, login/onboarding, sidebar, settings, notifications, PWA installation, native windows/menus/tray, startup, terminal and runtime skills. English interfaces keep the Chinese display name. Internal API names and paths use the ASCII namespace below.

The original `ui/public/logo-256.png` has SHA-256 `36c58fcbe68e6c7231358bed117acacbe37e5e76da791dd60c577ac93ed27a4b`. `node scripts/rebuild-brand-assets.mjs` derives Web, PWA, favicon, memory and desktop icons and wordmarks. Chinese wordmarks require an appropriate font such as Microsoft YaHei, Noto Sans CJK SC or PingFang SC. Generated runtime images are ordinary Git blobs; normal builds do not need font rendering or Git LFS. Images larger than 256px are upscaled from the original.

The browser favicon uses `ui/public/9gclaw-icon-128.png`, generated from the same source as the PWA 128px icon. `node scripts/check-branding.mjs` verifies their hashes, the source logo, namespace policy and release configuration.

## Namespaces and data

| Surface | Contract |
| --- | --- |
| CLI and packages | `9gclaw`, `9gclaw-ui`, `9gclaw-desktop`, `@9gclaw/config` |
| Global state and config | `~/.9gclaw`, `9gclaw.yaml`; overrides `NINEGCLAW_HOME`, `NINEGCLAW_CONFIG_PATH` |
| Environment and identifiers | `NINEGCLAW_*`; legal code identifiers use `NineGClaw` or `ninegclaw` |
| Windows program/install directory | `9GClaw` |
| Electron user data | `%APPDATA%/9gclaw-desktop`; runtime logs under `logs` |
| Installer and log exports | `9GClaw-<version>-win-<arch>-setup.exe`, `9GClaw-logs-*.log` |

Protocols, HTTP headers, local storage keys and internal module references use the same namespace. User-selected paths retain their names. Existing personal data is not automatically read, migrated or deleted from legacy directories. To retain it, quit the application, back it up, copy it into the new data directory and update environment variables/scripts explicitly.

## Distribution

The installer defaults to the `main` branch of `AI9Stars/9GClaw`. Desktop updates use only this repository's GitHub Releases. Windows x64 and ARM64 are the supported packaging targets; shared cross-platform source remains available. The application does not enable upstream analytics by default.

This fork is based on OpenBMB's upstream open-source project and retains original copyright and license notices. Root README content and existing source media remain preserved. See [releases](release.md) and [upstream synchronization](upstream-sync.zh.md) for maintenance rules.
