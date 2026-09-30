# 外观回归与平台边界

## 本次修复

- 纯色和渐变直接参与侧栏与主内容面板填充，不再被默认不透明的近白色面板覆盖。深色和过饱和背景会适当提亮；输入框、菜单和卡片保留实底。
- 渐变在侧栏和正文使用统一的窗口坐标，缩略预览使用同一派生规则与连续渐变；检查渐变中间色以及 60%/95% 透明度边界的文字对比度。
- 外观页与通用页共享卡片标题、设置行、下拉组件和开关；统一全宽布局、14px 标签/说明、控件宽度与对齐。窄窗口按通用页规则将控件移到下一行。
- 设置页按路由重建内容滚动容器；外观页加入独立滚动，侧栏与正文不传递滚动位置。
- 设置模块按需加载，只在进入“关于”或用户主动检查时查询版本。
- 背景输入仍接受 PNG/JPEG/WebP，但统一存储为 PNG，避免 Electron nativeImage 对 WebP 的平台兼容问题。长边不超过 3840 像素，输入和存储资源均限制 10 MB。
- 桌面图片通过二进制 IPC 与 Blob URL 显示，避免编辑每个滑块时复制整张 Base64 到样式表。
- 网页图片 ID 在缺少 randomUUID 的局域网 HTTP 环境使用 getRandomValues 生成 UUID，保留相同资源校验规则。
- 图像强度、模糊、亮度、饱和度、构图位置独立于面板填充；选定背景直接透过面板显示，不再提供实底/透出背景切换。默认侧栏 85%、正文 90%；折叠细调范围为 60%–95%，正文保留 90%–95% 填充。旧版 100% 配置自动恢复为默认 85%，已有颜色、图片资源与效果参数保留。没有启用原生 Acrylic/Vibrancy。
- 减少动态效果支持系统/开启/关闭；硬件加速只在桌面端提供，完整重启后生效。高级设置独立于深浅模式。
- 记忆仪表盘只接收界面语义色，状态色、内容与深色配色保持独立。

## 自动检查

在 `ui` 目录执行：

```powershell
node node_modules/vitest/vitest.mjs run src/lib/interfacePreferences.test.ts src/lib/lightAppearance.test.ts src/lib/appearanceImages.test.ts src/components/settings/view/appearance/appearance.test.tsx src/components/settings/navigation.spec.ts
node node_modules/vite/bin/vite.js build
```

在仓库根目录执行：

```powershell
node apps/desktop/node_modules/typescript/bin/tsc -p apps/desktop/tsconfig.json
node --test apps/desktop/scripts/*.test.mjs
node apps/desktop/scripts/verify-desktop-lifecycle.cjs normal
```

真实交互测试：先在 `ui` 启动 Vite `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5187 --strictPort`，然后在仓库根目录执行 `node ui/e2e/appearance.smoke.mjs`。

脚本使用独立临时用户目录与本地合成接口，不接触现有用户设置或模型服务。Electron 使用真实 preload、nativeImage、IPC 和磁盘存储；网页使用 Edge 与真实 IndexedDB。记忆页加载仓库中的实际仪表盘资源，数据接口使用测试响应。

覆盖设置切换、滚动、三种图片格式、替换与删除旧资源、刷新/进程重启、GPU 关闭、失效图片与损坏输入恢复、深浅切换、系统偏好、六套预设、渐变、减少动态效果、中英文、390px 窄屏及记忆页面色彩隔离。额外检查纯色/渐变的自动透色计算样式、旧版 100% 配置迁移、无需额外开关的图片显示、聊天区背景是否被覆盖，以及外观/通用页的字体、颜色、下拉尺寸、圆角、边框、控件起点是否完全一致。截图保存于 `artifacts/appearance-regression`。

## 验收范围

本次本机验证环境为 Windows，包含 Electron 与 Edge。macOS、Linux 和手机浏览器使用相同的 CSS/Canvas/IndexedDB 实现，但未在这些设备上实测，不能据此标记原生平台验收通过。系统原生颜色/文件选择对话框由各平台提供，外形可能不同。

项目全量 UI 类型检查仍有主分支已有的 React 类型版本冲突；变更需与主分支诊断对比，不能将已有错误描述为本次新增或声称全量类型检查通过。
