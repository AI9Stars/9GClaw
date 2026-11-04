# 九格智能体平台 Desktop

Electron desktop shell for the existing 九格智能体平台 Web UI and local gateway runtime.

## Notifications

**Settings > General > Notifications** controls system notifications, the default
notification sound, app icon counts, and message previews. Desktop preferences
are saved on this device. Banners and sounds also follow OS permission and
Do Not Disturb settings; the settings card links to the native notification
settings and provides instructions if the desktop environment cannot open them.

Completion, approval requests, questions, and terminal errors generate one
reminder per event. A conversation contributes at most one to the badge count;
viewing it clears that reminder without approving an operation or answering a
question. The visible, focused conversation is quiet. Connection loss lasting
15 seconds reminds only for running conversations. Automatic model retries and
user cancellation do not notify.

Desktop notifications rely on the OS application identity icon; no additional
content image is attached on macOS, Windows or Linux.

macOS uses Dock badges. Windows uses taskbar overlays; Windows and Linux tray
icons also show counts while the main window is hidden. Linux launcher badges
depend on the desktop's LauncherEntry support. Clicking a notification restores
the existing window and opens its conversation.

The web app uses browser notifications on HTTPS/localhost. With browser
permission and a reachable Web Push service, reminders can also arrive while
the page is closed. Browser tabs display the count in the title; installed PWAs
use app badges where supported. Service Worker storage deduplicates live and
push delivery and preserves pending reminders. Read state is local to each
browser/device.

## Development

```bash
pnpm install --frozen-lockfile
pnpm --filter 9gclaw-desktop dev
```

The desktop process starts the existing 九格智能体平台 gateway and UI server as local
child processes, then opens the packaged Web UI inside an Electron window.

## Background behavior and quitting

On macOS, the red close button and **File > Close Window** (`Cmd+W`) hide the
main window without destroying it. Tasks continue, and the same interface is
restored by clicking the Dock icon or choosing **Open main window** from the
九格智能体平台 status icon at the top of the screen. Full-screen windows leave their
Space before hiding. Minimizing and `Cmd+H` retain their native behavior. The Dock
icon remains available even if the status icon cannot be created.

The status icon menu, Dock **Quit**, application **Quit 九格智能体平台**, and `Cmd+Q`
share one native confirmation dialog. Cancel is the default. Confirming stops
the managed server, gateway and task processes before exiting. If cleanup fails,
the window reappears with an error and quitting can be retried. Menus and the
confirmation follow the application language. The status icon uses a monochrome
template image for light/dark menu bars, with a Retina representation.

This does not prevent sleep or change power management. System shutdown and
update installation bypass the user confirmation; update failure restores the
runtime and normal quit protection.

### Windows

Closing the main window (including Alt+F4) hides it in the Windows notification
area and keeps the local runtime and tasks running. Click the 九格智能体平台 tray icon
or choose **Open main window** to restore the same window and its current state.
Launching the client again also restores the existing instance.

The tray's **Quit** command and **File > Exit** restore the main window and show
an owned confirmation dialog. Cancel is the default. Confirming stops the managed
runtime before the application exits; automatic updates use their existing quit
path without a second confirmation. Tray menus and confirmation text follow the
application language.

### Ubuntu

Closing the main window keeps the app and local tasks running when a system tray
is available. The 九格智能体平台 icon in Ubuntu's top panel opens a native menu with
**Open main window** and **Quit**. Select **Open main window** to restore it.
Quit asks for confirmation and stops managed tasks. Launching 九格智能体平台 again
restores the existing window instead of starting another runtime. If creating
the tray icon fails, closing the window quits normally so it is not stranded
in the background. The desktop environment must provide a status icon host,
such as Ubuntu's AppIndicators extension, to show the top-panel icon.

Run `node --test apps/desktop/scripts/desktop-lifecycle.test.mjs` from the repository
root for the cross-platform controller checks. On macOS or Windows,
`node apps/desktop/scripts/verify-desktop-lifecycle.cjs` exercises the production
main process with real Electron windows and isolated server/gateway/task
processes. It covers hiding during startup, state-preserving restoration,
minimization, native macOS full screen, native quit dispatch, cancellation,
cleanup failure/retry, startup quit, update preparation/recovery and shutdown.
Windows also checks second-instance restoration. Dialog responses, update
handoff and shutdown events are simulated; the test never installs an update or
shuts down the host. Each scenario uses its own profile/configuration, and owned
process trees are cleaned even if an assertion fails.

The Windows release workflow also accepts the existing
`verify-windows-tray.cjs` entry point. Mac lifecycle checks run in Desktop Smoke
and both architecture-specific release builds. For manual validation of OS entry
points, check the actual red close button, `Cmd+W`, Dock click/right-click Quit,
status menu Open/Quit and `Cmd+Q`; cancel once, then confirm with a task running.
For an isolated native-dialog session, run
`node apps/desktop/scripts/verify-desktop-lifecycle.cjs manual` (five-minute timeout).
Confirm that restoring retains the draft and that quitting leaves no managed
runtime processes. Check the status icon in both light and dark menu bars.

Regenerate status icons from the checked-in SVG with
`node apps/desktop/scripts/rebuild-tray-icon.mjs`.

## Packaging

On a native Windows host matching the target architecture:

```powershell
pnpm install --frozen-lockfile
pnpm --filter 9gclaw-desktop dist:win:x64
# On Windows ARM64 instead:
pnpm --filter 9gclaw-desktop dist:win:arm64
```

This fork packages only Windows x64 and ARM64. The manual **Windows Release**
workflow publishes both installers to GitHub with the original run's Shanghai
date and next available revision. The **Desktop** PR workflow reuses the same
packaging job after regression checks and uploads installers as Actions
artifacts without publishing a release. Both architectures use native runners.

The build assembles one production runtime in `.runtime/app`, exercises real
NSIS install/upgrade/uninstall fixtures, and verifies bundled Node, Git, native
modules and electron-updater from the packaged application. Portable Git's MSYS
Bash can use x64 emulation on Windows ARM64.

The application displays **九格智能体平台**. Executables, installer filenames,
user-data and log directories use ASCII. Release assets include
`9GClaw-<version>-win-<arch>-setup.exe`, `latest-x64.yml`,
`latest-arm64.yml`, `release.json` and `SHA256SUMS.txt`.
Only the final publication job receives GitHub Release write permission.

The updater checks and downloads only from the configured GitHub repository.
No OBS credentials, uploads or mirror configuration are used. Windows packaging
is unsigned: `win.signExecutable=false` disables signing while retaining
Electron executable icon/version editing. `win.verifyUpdateCodeSignature=false`
matches this policy; update integrity uses SHA-256/SHA-512 verification.
No certificate discovery, local signing configuration or signing secrets are needed.

See [release and recovery](../../docs/release.md) and
[future upstream sync](../../docs/upstream-sync.zh.md).

## Window chrome and application commands

macOS keeps native traffic lights in the sidebar's 48px top strip. The main
header extends to the window edge. Collapsing the sidebar, entering compact
mode or opening Settings reserves a full-width strip; fullscreen removes it.
Windows and Ubuntu use a 40px title-bar overlay with native caption buttons,
putting the application menus and window controls on one row. The caption
has a neutral light/dark background; the main interface keeps its original sidebar
gradient, layout, rounded frame, borders and viewport gutter.
File, Edit, View, Go and Help open the corresponding menu sections; Alt+F/E/V/G/H
access them directly. F10 opens the application menu on Windows and the File
section on Linux, including in fullscreen. Tab and arrow keys navigate caption
buttons. Menu clicks preserve the editor selection. While a popup is open,
hovering or clicking another caption menu switches directly to it. Windows uses
native submenus and tracks the native cursor while they are open. Linux renders
the popup from the same current application menu template inside the window;
the native menu remains registered for keyboard accelerators and OS integration.
Its drag region reserves the native controls' area through
the Window Controls Overlay geometry; the workspace header also supports dragging.
Alt does not reveal a duplicate system menu row. Windows fullscreen state is
published after the native transition updates, removing/restoring the top inset.
All three platforms retain native frames, resizing and shadows. macOS removes the Web
viewport's extra gutter, border, rounded corners and shadow. Windows and Ubuntu reserve
space for the caption; business components and browser/PWA styles are preserved.
The caption is preload-owned, so it also works during startup and onboarding.
Caption labels initialize from the saved desktop language and follow the UI's
resolved i18n language immediately, together with the native application menu.
The caption, Linux popup and Electron native theme follow the app's
light/dark/system preference immediately. The Linux popup does not depend on a
particular GTK theme, panel extension or desktop environment, so the same menu
code applies on Ubuntu, Kylin, Deepin and UOS when their Electron and package
dependencies are compatible. Distribution-level installation and tray behavior
still require testing on each target desktop. Opaque surfaces are intentional;
this implementation does not require vibrancy or Mica.

The native menu routes New Conversation, New Project, Settings, Find, sidebar
visibility, Conversation, Project Files, Skills, Scheduled Tasks and Check for
Updates to their existing UI owners. App actions are disabled before the shell
is ready and while a modal blocks navigation. Reload/renderer failure clears the
native state, and the renderer rechecks context when a command arrives.
Find menu state uses the same registered, visible target and focused-surface
resolver as the Find shortcut; an empty Files page does not enable it. A new
conversation uses the same project inheritance as the sidebar button. Updates
open Settings > About and use the existing check and installation UI.

Default shortcuts: Cmd/Ctrl+N (conversation), Cmd/Ctrl+Shift+N (project),
Cmd/Ctrl+, (settings), Cmd/Ctrl+F (focused-surface find), Cmd/Ctrl+B (sidebar),
Cmd/Ctrl+R (reload), plus the native edit, zoom and fullscreen commands. Find and
sidebar shortcuts reach the renderer so editors/terminals keep their own keys.
Help opens the public documentation and GitHub issues in the system browser;
Copy Version Information includes version, OS/architecture, Electron and build
commit, without logs or project paths. Existing close/quit safeguards still apply.

### Chrome verification

Use Node 22, then run:

```bash
pnpm --filter 9gclaw-desktop compile
pnpm --dir ui exec vitest run server/services/desktopChrome.test.ts server/services/windowsCaptionMenu.test.ts server/services/desktopApplicationMenu.test.ts src/components/desktop/useDesktopCommands.test.tsx src/contexts/FindShortcutContext.test.tsx
```

On macOS or Windows, start an isolated UI development server in a separate terminal:

```bash
pnpm --dir ui exec vite --host 127.0.0.1 --port 5187 --strictPort
node ui/e2e/desktop-chrome.smoke.mjs
```

On Ubuntu 22.04, run the same smoke suite under both X11 and a headless Wayland
compositor with `bash apps/desktop/scripts/run-linux-chrome-smoke.sh x11` and
`bash apps/desktop/scripts/run-linux-chrome-smoke.sh wayland`. It verifies the
single-row caption, menu commands, Chinese/English labels in the caption and
Linux popup, and light/dark menu colors. The Linux CI job runs both display
paths on x64 and arm64 before PR merge and in the daily release pipeline.

The smoke host uses the real compiled preload and application UI with a temporary
Electron profile and mocked API/WebSocket traffic. It does not start the real
runtime or send model requests. It invokes native menu callbacks to check commands,
project inheritance, dialog blocking, sidebar collapse, repeated update checks,
light/dark appearance, native fullscreen transitions and traffic-light position,
and minimize/restore. Windows checks native popup requests; Linux checks its
interactive popup contents and live theme/language updates. Both check
caption/sidebar colors, control safe area and fullscreen inset restoration.
Windows additionally checks maximize/restore; the headless Linux compositors
have no window manager to verify maximize behavior.
Set `NINEGCLAW_CHROME_SCALE` to `1`, `1.25` or `1.5` for Windows scaling checks.
Screenshots go to `outputs/desktop-chrome-review` (override
with `NINEGCLAW_CHROME_ARTIFACTS`). Run the lifecycle suite above as well when
changing the main process.

Windows native acceptance needs a Windows host: check menu keyboard
navigation/F10, all three caption buttons, double-click maximize/restore, edge
resizing, Snap Layouts, 100%/125%/150% scaling, fullscreen and light/dark/system
appearance. On macOS, manually check native menu accelerators, titlebar dragging and the system's configured
double-click action, including controls/popovers overlapping the header.
