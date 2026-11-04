# 九格智能体平台品牌

当前仓库的对外名称为 **九格智能体平台**，沿用仓库已有的 [Logo 原图](https://github.com/AI9Stars/9GClaw/blob/main/ui/public/logo-256.png)和明暗字标。纯图形 Logo 原样保存在 `ui/public/logo-256.png`，SHA-256 为 `36c58fcbe68e6c7231358bed117acacbe37e5e76da791dd60c577ac93ed27a4b`。

品牌覆盖 Web 的标题、登录与引导页、侧栏、设置、通知、PWA 图标和安装名称，以及桌面窗口、原生菜单、托盘、启动页、终端和智能体的自我介绍。英文界面同样使用中文品牌名称。桌面应用和安装器显示的产品名称为“九格智能体平台”。Windows 下载文件使用 `9GClaw-<version>-win-<arch>-setup.exe`，避免 GitHub Release 上传时移除中文文件名，构建检查、发布清单和更新源使用这个 ASCII 下载名称。

## 资源维护

运行 `node scripts/rebuild-brand-assets.mjs` 可从 Logo 原图生成 Web、PWA、记忆页面、桌面和 macOS 托盘资源。生成中文字标需要中文字体，例如 PingFang SC、Noto Sans CJK SC 或 Microsoft YaHei。已生成的资源通过普通 Git 文件提交，正常构建不需要 Git LFS 或重新渲染字体。大于 256px 的图标由原图放大生成。

## 命名空间与数据路径

CLI 为 `9gclaw`，包名为 `9gclaw`、`9gclaw-ui`、`9gclaw-desktop` 和 `@9gclaw/config`。全局数据目录为 `~/.9gclaw`，配置文件为 `9gclaw.yaml`，可用 `NINEGCLAW_HOME` 和 `NINEGCLAW_CONFIG_PATH` 覆盖。环境变量统一为 `NINEGCLAW_*`；需要合法字母开头的代码标识使用 `NineGClaw` 或 `ninegclaw`。协议、HTTP 请求头、本地存储键和内部模块同步改名。

Windows 程序与安装目录使用 `9GClaw`，Electron 用户数据和日志位于 `%APPDATA%/9gclaw-desktop`，导出日志文件名使用 `9GClaw-logs-*.log`。产品显示中文名称，不把中文品牌名称用于默认路径。用户自行选择的目录仍会保留原名。

这是一次命名空间变更，不会自动读取、迁移或删除旧版的个人数据。需要保留旧配置与会话时，退出客户端后备份旧数据，再复制到上述新目录；已有环境变量和脚本也需改用新名称。开发同步过程不会操作用户数据。

原生启动页、Web 首屏和 React 加载页共享上游进度条样式；Logo 与“九格智能体”单行居中，亮色、暗色和减少动画模式使用同一布局。完整产品名称和智能体身份仍为“九格智能体平台”。更新仅从本仓库 GitHub Release 获取，不默认连接上游镜像或分析服务。

安装器默认从 `AI9Stars/9GClaw` 的 `main` 分支安装。本项目基于 OpenBMB 的上游开源项目，保留原始版权和许可证。首页两个 README 保留本仓库原有内容。后续同步流程见 [上游同步维护](upstream-sync.zh.md)。
