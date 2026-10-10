# 九格智能体平台品牌

当前仓库的对外名称为 **九格智能体平台**，Logo 和明暗字标参考 [PilotDeck 的 feat/9gclaw 分支](https://github.com/mssssss123/PilotDeck/tree/feat/9gclaw)。纯图形 Logo 原样保存在 `ui/public/logo-256.png`，SHA-256 为 `36c58fcbe68e6c7231358bed117acacbe37e5e76da791dd60c577ac93ed27a4b`。

品牌覆盖 Web 的标题、登录与引导页、侧栏、设置、通知、PWA 图标和安装名称，以及桌面窗口、原生菜单、托盘、启动页、终端和智能体的自我介绍。英文界面同样使用中文品牌名称。桌面应用和安装器显示的产品名称为“九格智能体平台”。Windows 下载文件使用 `9GClaw-<version>-win-<arch>-setup.exe`，避免 GitHub Release 上传时移除中文文件名，构建检查、发布清单和更新源使用这个 ASCII 下载名称。

## 资源维护

运行 `node scripts/rebuild-brand-assets.mjs` 可从 Logo 原图生成 Web、PWA、记忆页面、桌面和 macOS 托盘资源。生成中文字标需要中文字体，例如 PingFang SC、Noto Sans CJK SC 或 Microsoft YaHei。已生成的资源通过普通 Git 文件提交，正常构建不需要 Git LFS 或重新渲染字体。大于 256px 的图标由原图放大生成。

## 兼容性与来源

保留 `pilotdeck` 命令、工作区包名、`~/.pilotdeck`、`pilotdeck.yaml`、`PILOTDECK_*` 环境变量、桌面应用标识、内部模块名、协议字段和本地存储键，以兼容已有配置、会话与自动化。HTTP 请求头使用 ASCII 客户端标识。历史对话、记忆和用户记录不会被改写。

安装器默认从 `AI9Stars/9GClaw` 的 `main` 分支安装。本项目基于开源 [PilotDeck](https://github.com/OpenBMB/PilotDeck)，保留原始版权、许可证、引用、联合研发来源和社区作品名称。仓库首页 README 展示品牌 Logo、AI9Stars 的平台介绍与核心能力，并提供 Windows 客户端下载说明。
