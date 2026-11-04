# 九格智能体平台 releases and desktop builds

9GClaw keeps Web and desktop sources on `main`. The desktop application is a
thin Electron shell around the same gateway and Web UI; desktop-specific runtime
behavior is enabled only when Electron sets `NINEGCLAW_DESKTOP=1`.

## Cron upgrade compatibility

The schedule computation version 3 upgrade changes existing recurring tasks
with two restricted day fields from AND to Unix cron OR matching. These tasks
may run more often. Review affected schedules before upgrading; see
[Cron scheduling and the version 3 upgrade](cron-scheduling.md) for examples
and pending-run migration behavior.

## Web compatibility

- The existing root and `ui` build commands remain the source of the Web build.
- Docker installs only the root and UI workspace dependencies, so Electron and
  its native packaging dependencies are not installed in the Web image.
- Browser deployments never receive the Electron preload bridge.
- Desktop runtime files live under `apps/desktop` and are ignored by the Docker
  build context.
- Desktop runtime production dependencies use the dedicated manifest and frozen
  lockfile under `apps/desktop/runtime`; Web installs do not include this package.

Pull requests run Desktop regression, static checks and real x64/ARM64 packaging on Windows only.
No macOS/Linux runner, Docker packaging or OBS publication workflow is enabled.

The Web test job uses separate client/jsdom and server/Node Vitest projects.
They collect `ui/src` and `ui/server`; Playwright E2E tests use their own runner.
Desktop updater tests run in the Desktop checks job with desktop dependencies.
See [test selection and maintenance](testing.zh.md) for local commands and
guidance on keeping regression coverage focused.

## Manual Windows release policy

Open **Actions → Windows Release → Run workflow**, select `main`, and run it.
`.github/workflows/release.yml` has only `workflow_dispatch`: there is no daily
schedule or push-triggered release. Every manual run
builds, even when production code has not changed. The separate **Desktop**
workflow compiles, tests and packages desktop-related pull requests without publishing.

The release builds only Windows x64 and ARM64 NSIS installers on native
`windows-latest` and `windows-11-arm` runners. x64 is the 64-bit Intel/AMD
version, not 32-bit x86. macOS and Linux packaging workflows and the separate
Desktop Build entry point and non-Windows packaging commands have been removed.

The release date comes from the original Actions run's creation timestamp,
converted to Asia/Shanghai once in the preparation job. Queue delays,
midnight crossings and build retries do not change the date. Release names and
tags are `vYYYY.MM.DD`, for example `v2026.10.09`. Another release on the same
date uses the next free revision: `v2026.10.09-r2`, `-r3`, and so on. Existing
tags are never overwritten. The internal Electron version uses numeric SemVer:
`v2026.10.09` maps to `2026.1009.0`, and `-r2` maps to `2026.1009.1`.

All packages and the release tag use the exact `main` commit selected when the
manual run started. Publication waits for both Windows architectures and checks
their filenames, architecture metadata, update feeds, sizes and checksums.
Each release contains:

- `9GClaw-<version>-win-x64-setup.exe`
- `9GClaw-<version>-win-arm64-setup.exe`
- `latest-x64.yml` and `latest-arm64.yml`
- `release.json` and `SHA256SUMS.txt`

The application and installer still display 九格智能体平台. Download filenames
use ASCII because GitHub removes Chinese characters from uploaded asset names.
GitHub also provides source ZIP and tar.gz archives for the release tag.
`release.json` records the numeric version, tag, release date, metadata generation
time (`buildTime`), source commit (`sourceSha`), repository, and asset sizes,
platforms, architectures and SHA-256/SHA-512 checksums. The checksum file covers
uploaded assets, not GitHub-generated source archives. The final job marks the
published release **Latest**.

If the first attempt fails only during Windows builds,
`.github/workflows/release-retry.yml` requests one automatic retry of failed
jobs. Successful builds, the source SHA, date and revision are retained. Each
architecture can replace its own Actions artifact during a retry. Preparation
failures, publication failures, cancelled jobs and second or later attempts are
not automatically retried. The decision appears in **Retry Release Build**.

Build scripts use `NINEGCLAW_RELEASE_DATE`, `NINEGCLAW_RELEASE_REVISION`,
`NINEGCLAW_RELEASE_VERSION`, `NINEGCLAW_RELEASE_TAG`, and
`NINEGCLAW_RELEASE_BUILD_TIME` for release metadata. The preparation helper also
accepts `NINEGCLAW_RELEASE_STARTED_AT` to preserve the original manual-run date.
These are separate from desktop runtime environment variables.

Publishing and packaged update metadata use the repository running the workflow,
so this repository publishes and checks updates in `AI9Stars/9GClaw`.
The Web About page shows the local build version and links to GitHub Releases;
command-line and IM updates retain the Git deployment policy in
[Web updates](web-update.md).

## Desktop updates

The client checks only the configured GitHub repository's
`releases/latest/download/release.json`. Each metadata request has an eight-second
deadline and one retry. All download URLs are constructed locally from that
repository and the validated release tag and filename; remote metadata cannot
introduce another host. There is no OBS source, mirror configuration, speed race
or persistent route cache. Existing `update-route.json` files are ignored.

The manifest's repository, tag, numeric version, source commit, asset names,
sizes and SHA-256/SHA-512 checksums are validated. Only a higher version offers
an update, and selection requires an exact Windows architecture match.

| Client | Payload | Compatibility feed |
| --- | --- | --- |
| Windows x64 | x64 setup EXE | `latest-x64.yml` |
| Windows ARM64 | ARM64 setup EXE | `latest-arm64.yml` |

New clients read JSON directly through a custom electron-updater provider;
YML feeds are generated for compatibility. The local `app-update.yml` remains
library/cache configuration. Releases require both installers and both feeds.

Before offering an update, a bounded GitHub payload availability check rejects
HTML/error responses, empty bodies and known size mismatches without requiring
a minimum transfer rate. Starting an update checks readiness again. Download
failures retry the same GitHub URL; partial bytes are never combined across
attempts. Downloads share Electron's network session and the user's proxy
configuration with release checks. Proxy environment variables take precedence
over `proxy.url`/`proxy.noProxy`; absent those settings, Electron uses system
proxy settings.

Pause stops file writes and suspends the watchdog; Resume continues the same
request. Cancellation removes partial cache and never installs. The watchdog
counts actual payload bytes, including chunked responses without Content-Length.
SHA-512 and SHA-256 verification must succeed before managed services stop and
NSIS installs and relaunches. These Windows packages are unsigned; integrity is
checked with manifest hashes. NSIS can request administrator approval because
the installation is per-machine. Silent updates retain the installed directory.

The About page polls Electron IPC, so closing settings or stopping the Web server
does not interrupt an update. Normal quit does not install a cached update.
Download failures retain running services; installation errors received before
exit recover the runtime. Development clients cannot install updates.

PR and Release builds share `desktop-windows.yml`: real Electron NSIS transport
checks cover slow payloads, pause/resume, cancellation/cache cleanup, redirects,
checksum failures and a chunked transfer crossing the 30-second watchdog.
Installer fixtures exercise install/upgrade/uninstall. Packaged verification
loads the actual bundled Node/native modules and updater inside `app.asar`.
An end-user upgrade/relaunch should additionally be checked on both Windows
architectures when changing the install lifecycle.

## GitHub credentials

Windows packaging is explicitly unsigned and does not require a signing
certificate or macOS secrets. The workflow's automatic `GITHUB_TOKEN` reads run
metadata; only the final publication job receives `contents: write` to create
the GitHub Release. No personal access token is required.

## Manual builds

```bash
pnpm install --frozen-lockfile
pnpm --filter 9gclaw-desktop test
# Run on a native Windows host matching the target architecture:
pnpm --filter 9gclaw-desktop dist:win:x64
pnpm --filter 9gclaw-desktop dist:win:arm64
```

When a root or UI dependency used by the desktop runtime changes, update
`apps/desktop/runtime/package.json`, then refresh its dedicated lockfile with:

```bash
pnpm --dir apps/desktop/runtime install --lockfile-only --ignore-workspace
```

The desktop build fails if the runtime manifest no longer matches the root and
UI manifests, or if its committed lockfile is stale.

## Recovery

If an architecture fails, fix the build issue and rerun the failed jobs. A release
is created only after both Windows installers and update feeds are downloaded
and verified. For another release on the same Shanghai date, manually start
**Windows Release** again; the next revision is allocated automatically.

## Update regression smoke checks

After compiling the desktop main process, run the real Electron networking
check with the installed development Electron binary:

```sh
pnpm --filter 9gclaw-desktop compile
pnpm --filter 9gclaw-desktop exec electron scripts/verify-update-network.cjs
pnpm --filter 9gclaw-desktop exec electron scripts/verify-update-download.cjs
node apps/desktop/scripts/verify-installer.cjs
```

The download check also runs in Windows CI. It uses local HTTP fixtures to test
pause/resume, cancellation, retry and a chunked transfer lasting more than 30 seconds
without Content-Length or upstream progress events; installation is stubbed.

The network check requires OpenSSL and uses a temporary local HTTPS origin and
proxy, without contacting GitHub or installing anything. It covers both config
and environment proxy discovery/download paths, the GitHub asset redirect,
proxy authentication, and loopback bypass. The installer
check downloads the builder's NSIS toolchain if uncached, compiles the launch
paths using the installed templates, and checks that both use `explorer.exe`.
It uses the builder's template working directory, stdin input, and include
search paths, including a project path with spaces. Custom sibling includes
must resolve from `${PROJECT_DIR}` rather than relying on the current directory.
The Windows Release workflow builds the actual NSIS installer, validates the
packaged updater and elevation helper, and requires each architecture's update
feed. Its installer fixture executes isolated install, upgrade, cancellation
and uninstall flows. Native process ownership and Electron tray lifecycle
checks also run before packaging. Production Windows elevation and relaunch
still require real platform upgrade tests.
Only the final publication job can create a GitHub Release. Native builds check
out the calling event's fixed SHA; callers cannot choose arbitrary source revisions.

## Managed process shutdown

Only explicitly launched desktop services and Web update build commands use the
registry and guardian. There is no global Node spawn replacement or inherited
preload. Business commands, plugins, cluster workers and IPC keep their native
process behavior. Command exit is reported independently from guardian cleanup,
so a completed command does not wait for its background processes to finish.

On POSIX, a guardian anchors each command's group until its members finish or
shutdown terminates the group. Creation identities are checked before signals;
a missing or replaced guardian is an explicit cleanup failure. On Windows, an
external PowerShell/C# Job holder assigns the guardian to a non-breakaway Job
before command execution, terminates through the Job handle, and confirms zero
active processes. Runtime restart/installation must not proceed if registration,
identity verification, Job assignment or cleanup cannot be confirmed.
On POSIX the guarantee covers the registered process group, including orphaned
members that retain that group. Arbitrary business tasks that detach into other
sessions/groups are outside this guarantee; this is not a general process sandbox.

`node --test apps/desktop/scripts/process-scope.test.mjs` exercises IPC and
inherited-group cleanup after command exit, plus native Bash background launch
and sibling cancellation behavior on POSIX.
The Desktop workflow runs helper and native Windows process tests before PR
packaging; both packaging architectures also verify the bundled process helper. Windows identity lookup uses targeted .NET process queries instead
of CIM enumeration, allowing 15 seconds per query and a bounded 60-second
bootstrap window. Shutdown retains identity checks and native Job termination;
startup failure reports its cause before waiting for application IPC. These
checks do not replace an actual Windows installation/upgrade test.

Local RPM builds and validation are documented in
[RPM desktop support](redhat-desktop-support.md). This repository does not
build or publish Linux installers in GitHub Actions.
