# 九格智能体平台 releases and desktop builds

PilotDeck keeps Web and desktop sources on `main`. The desktop application is a
thin Electron shell around the same gateway and Web UI; desktop-specific runtime
behavior is enabled only when Electron sets `PILOTDECK_DESKTOP=1`.

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

Pull requests that touch shared, UI, Docker, or desktop code run the Web
regression workflow. Desktop-related pull requests also compile and test the
desktop shell.

The Web test job temporarily excludes `ui/e2e/**` (Playwright tests are not
Vitest tests) and the upstream `streamSmoother.test.ts` fake-timer test. Both are
known baseline failures; all other UI/server tests remain in the merge gate.

## Manual Windows release policy

Open **Actions → Windows Release → Run workflow**, select `main`, and run it.
`.github/workflows/release.yml` has only `workflow_dispatch`: there is no daily
schedule, push-triggered packaging or PR-triggered packaging. Every manual run
builds, even when production code has not changed. The separate **Desktop**
workflow still compiles and tests desktop-related pull requests.

The release builds only Windows x64 and ARM64 NSIS installers on native
`windows-latest` and `windows-11-arm` runners. x64 is the 64-bit Intel/AMD
version, not 32-bit x86. macOS and Linux packaging workflows and the separate
Desktop Build entry point have been removed; local build commands remain available.

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

Build scripts use `PILOTDECK_RELEASE_DATE`, `PILOTDECK_RELEASE_REVISION`,
`PILOTDECK_RELEASE_VERSION`, `PILOTDECK_RELEASE_TAG`, and
`PILOTDECK_RELEASE_BUILD_TIME` for release metadata. The preparation helper also
accepts `PILOTDECK_RELEASE_STARTED_AT` to preserve the original manual-run date.
These are separate from desktop runtime environment variables.

Publishing and packaged update metadata use the repository running the workflow,
so this repository publishes and checks updates in `AI9Stars/9GClaw`.
The Web About page shows the local build version and links to GitHub Releases;
command-line and IM updates retain the Git deployment policy in
[Web updates](web-update.md).

## Desktop updates

The client reads `release.json` from the GitHub Release explicitly marked
**Latest** in its packaged repository (or `PILOTDECK_UPDATE_REPOSITORY` override).
The release workflow marks each completed release Latest. The client validates
the manifest's tag, numeric version, repository, source commit format, asset
names, sizes and checksums. That version is compared numerically
with Electron's `app.getVersion()`: only a higher version offers an update.
Equal or older releases never trigger a downgrade. Release allocation uses the
largest existing revision for the date plus one, including manually skipped
revisions, and rejects a manually requested version below any published version. Historical `desktop-v` tags
and filename-based version guessing are not supported.

Automatic update selection requires an exact platform and running-client architecture:

| Client | Update payload | Feed |
| --- | --- | --- |
| Windows x64 | x64 setup EXE | `latest-x64.yml` |
| Windows ARM64 | ARM64 setup EXE | `latest-arm64.yml` |

Each architecture has its own feed so parallel builds cannot overwrite another
architecture's update metadata. CI verifies both feeds and installers before
publishing. Full downloads are used; blockmaps and differential updates are not
required. This repository's releases do not contain macOS or Linux update assets.

**Update and restart** is one explicit user action. The Electron main process
uses the shared release discovery module, then pins electron-updater's generic
feed to that exact GitHub Release tag. It checks the feed version, file names,
architecture, sizes and SHA-512 hashes against `release.json` before downloading.
Electron-updater verifies the downloaded payload; the client also verifies its
SHA-256 before stopping the gateway and Web server. Finally it invokes the
updater to install and relaunch the application. macOS performs native signature
verification; Windows may show an administrator approval prompt because our
NSIS installer is per-machine. Both the interactive installer and silent
`--force-run` updates launch via the existing `explorer.exe` workaround.
On Ubuntu, the DEB updater asks for PolicyKit authorization to install the
verified package with `dpkg`, then relaunches. The client does not install
updates automatically on quit.
Before installation, runtime shutdown confirms that managed descendants exited;
a failed stop aborts installation and retains process records for recovery.

Release checks, manifests, update feeds and payload downloads share the
`electron-updater` network session. It reads the user's `proxy.url` and
`proxy.noProxy`; proxy environment variables (`PILOTDECK_PROXY`, `https_proxy`,
`HTTPS_PROXY`, `http_proxy`, `HTTP_PROXY`, in that order) take precedence.
Loopback traffic always bypasses the proxy for the local Mac updater. Proxy
settings refresh before checking and remain fixed during an active update.
Without an application or environment proxy, Electron uses system proxy settings.

The updater is a production dependency inside `app.asar`. CI loads it and its
transitive dependencies using the packaged Electron executable, and checks that
Windows includes `elevate.exe`. Normal shutdown continues through `app.quit()`;
the update path stops managed services first and lets the updater own process
exit. It must never short-circuit this with `app.exit()`.

The About page polls Electron IPC, so closing settings or stopping the Web server
does not interrupt the update. Checking and downloading can be cancelled; the
install phase cannot. Download/verification failures leave services running and
allow retry. Installation errors received while Electron is still running
restore the runtime and ask the user to restart the client before retrying.
Closing the client normally does not automatically install a cached update.
Unpackaged development clients cannot install updates.

This capability starts with a client built from this implementation. Clients
that only open DMG/EXE installers, and the earlier Ubuntu `0.1.0` test packages,
need to install this version once before later
releases can update automatically. A release without the required update feed
or matching payload disables the action with an explanation.

Changes to this flow require a real old-version-to-new-version install test on
macOS arm64, macOS x64 (including Rosetta), Windows x64, Ubuntu x64, and Ubuntu
arm64. Unit and packaging
tests alone do not establish that signing, elevation, replacement and relaunch
work on those systems.

## GitHub credentials

Windows packaging is explicitly unsigned and does not require a signing
certificate or macOS secrets. The workflow's automatic `GITHUB_TOKEN` reads run
metadata; only the final publication job receives `contents: write` to create
the GitHub Release. No personal access token is required.

## Manual builds

```bash
pnpm install --frozen-lockfile
pnpm --filter pilotdeck-desktop test
# Run the command matching the Mac host architecture:
pnpm --filter pilotdeck-desktop dist:mac:arm64
pnpm --filter pilotdeck-desktop dist:mac:x64
# Run the following on Windows:
pnpm --filter pilotdeck-desktop dist:win:x64
pnpm --filter pilotdeck-desktop dist:win:arm64
# On native Ubuntu 22.04 hosts with matching architectures:
pnpm --filter pilotdeck-desktop dist:linux:x64
pnpm --filter pilotdeck-desktop dist:linux:arm64
```

Local macOS builds can use ad-hoc signing. Set
`PILOTDECK_DESKTOP_REQUIRE_SIGNING=1` to enforce production signing locally.

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
pnpm --filter pilotdeck-desktop compile
pnpm --filter pilotdeck-desktop exec electron scripts/verify-update-network.cjs
node apps/desktop/scripts/verify-installer.cjs
```

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
and sibling cancellation behavior on POSIX. Both Windows architecture jobs
run it before packaging.
The Desktop workflow runs helper tests on relevant PRs; native Windows process
tests run during the manual Windows Release. Windows identity lookup uses targeted .NET process queries instead
of CIM enumeration, allowing 15 seconds per query and a bounded 60-second
bootstrap window. Shutdown retains identity checks and native Job termination;
startup failure reports its cause before waiting for application IPC. These
checks do not replace an actual Windows installation/upgrade test.

Local RPM builds and validation are documented in
[RPM desktop support](redhat-desktop-support.md). This repository does not
build or publish Linux installers in GitHub Actions.
