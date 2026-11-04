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

Pull requests run the Desktop regression and static checks on Windows only.
No macOS/Linux runner, Docker packaging or OBS publication workflow is enabled.

The Web test job uses separate client/jsdom and server/Node Vitest projects.
They collect `ui/src` and `ui/server`; Playwright E2E tests use their own runner.
Desktop updater tests run in the Desktop checks job with desktop dependencies.
See [test selection and maintenance](testing.zh.md) for local commands and
guidance on keeping regression coverage focused.

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

The desktop client discovers releases through the official Huawei OBS bucket
and GitHub repository only. Both requests start immediately, in every region;
public third-party proxies are not used. Each route has an 8-second discovery
deadline. After finding an update newer than the installed version, the client
allows 1.2 seconds for peers and chooses the highest valid version received.
If the first response is equal to or older than the installed version, it waits
for the other route's deadline before reporting no update, so a fast stale
mirror does not hide an available update. An unreachable source may still contain
a newer version, which a later check can discover. If neither route succeeds,
both receive one more attempt before the check fails.

OBS uses the website's `9GClaw/latest.json` pointer, then the immutable
`9GClaw/<tag>/release.json`; pointer URLs are never trusted as download hosts.
GitHub uses the release explicitly marked **Latest**. Fork builds
and `NINEGCLAW_UPDATE_REPOSITORY` overrides never query the official OBS bucket.
The release workflow marks each completed release Latest. The client validates
the manifest's tag, numeric version, repository, source commit format, asset
names, sizes and checksums. That version is compared numerically
with Electron's `app.getVersion()`: only a higher version offers an update.
Equal or older releases never trigger a downgrade. Release allocation uses the
largest existing revision for the date plus one, including manually skipped
revisions, and rejects a manually requested version below any published version. Historical `desktop-v` tags
and filename-based version guessing are not supported.

`release.json` is the canonical release configuration. Its `schemaVersion` remains
`1` for installed clients; additive `artifactSchemaVersion: 1`, `format` and
`roles` fields distinguish initial installers (`install`), updater payloads
(`update`) and generated legacy metadata (`compatibility`). Older JSON manifests
without these fields remain readable. The release job hashes payloads first,
derives all eight YML feeds from those records, then records the feeds' hashes in
the same JSON and checksum file. Builder-generated feeds are replaced, not merged
as a second source of release metadata.

Automatic update selection requires an exact platform and running-client architecture.
New clients read JSON directly; the feed column documents compatibility for older clients:

| Client | Update payload | Feed |
| --- | --- | --- |
| Windows x64 | x64 setup EXE | `latest-x64.yml` |
| Windows ARM64 | ARM64 setup EXE | `latest-arm64.yml` |

Each architecture has its own feed so parallel builds cannot overwrite another
architecture's update metadata. CI verifies both feeds and installers before
publishing. Full downloads are used; blockmaps and differential updates are not
required. This repository's releases do not contain macOS or Linux update assets.

**Update and restart** is one explicit user action. The Electron main process
uses the shared release discovery module, then gives electron-updater a custom
provider containing the exact selected JSON payload and release tag. New clients
never fetch a YML update feed. The same version, file name, architecture, size and
SHA-512 hash stay pinned across every route and retry.
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

Release checks, manifests and payload downloads share the
`electron-updater` network session. It reads the user's `proxy.url` and
`proxy.noProxy`; proxy environment variables (`NINEGCLAW_PROXY`, `https_proxy`,
`HTTPS_PROXY`, `http_proxy`, `HTTP_PROXY`, in that order) take precedence.
Loopback traffic always bypasses the proxy for the local Mac updater. Proxy
settings refresh before checking and remain fixed during an active update.
Without an application or environment proxy, Electron uses system proxy settings.

Before offering an update, the client samples the selected payload on both
routes, stopping as soon as one works. If neither works within eight seconds,
the new version stays visible with a temporary-unavailability message and a
Check again action. Starting an update rechecks readiness. HTML/error responses,
empty bodies and known size mismatches are rejected. This is a reachability
check, not a guarantee against a later outage; full-download hashes remain required.

Before downloading, the client samples up to 256 KiB of the selected installer
from both routes concurrently, with a 5-second deadline per request and no disk writes.
After the first successful sample, it gives the competitor 150 ms to finish,
then aborts outstanding sampling instead of waiting for the slow route's timeout.
It also aborts the sample if a host ignores Range. Elapsed sample time determines
order. A remembered successful route gets a 100 ms preference when speeds are
similar; without history an exact tie prefers OBS. Failed or unfinished probes
remain fallbacks for transient network failures. A server rejecting Range with
400/405/416 gets one bounded plain GET attempt; it still stops after 256 KiB.
There is no IP geolocation or language-based region assumption: actual network
conditions, including the configured proxy, determine the choice each time.

Daily Release calls the reusable OBS synchronization workflow immediately after
GitHub publication, passing the exact tag rather than rediscovering Latest.
Manual and scheduled repair runs remain available. OBS uploads and verifies all
assets (including YML and ZIP), then promotes `latest.json` last. A delayed older
job cannot move the pointer backwards; conflicting bytes under an existing tag
require a new revision. GitHub can become visible before OBS finishes; clients
fall back to GitHub for that same version. Sync failure leaves the old OBS pointer
intact unless publication itself failed ambiguously, in which case the saved
pointer and readback evidence support manual recovery.

Keep generating YML while supported installed clients need it. Once those clients
are retired, remove compatibility generation and its publication gate together;
new clients require no protocol change. The builder's local `app-update.yml`
is library/cache configuration, not a second remote release manifest, and stays.

Only a fully downloaded and verified package records route success. The client
atomically saves the repository, official route ID and success timestamp in
`update-route.json` under Electron's user-data directory. This preference survives
restarts for seven days, contains no credentials or remote-supplied URLs, and is
discarded on that route's download/feed/verification failure. Cancellation does
not record success or penalize a route. Unknown IDs, different repositories,
expired/future timestamps and unreadable caches are ignored; inability to save
the cache never prevents updating. Every download still samples both routes so
network changes, travel or a different VPN can override the previous preference.

Feed requests have a 15-second deadline, including redirects and response bodies.
Feed, network and checksum failures advance to the next route. After trying all
routes, one final round retries them. Thirty seconds without progress triggers
a switch; the first round also switches below 32 KiB/s sustained throughput.
The final round accepts slow progress so slow local connectivity still works.
The watchdog counts actual payload bytes in the download transport, independently
of progress events or Content-Length, so healthy chunked responses are not cancelled.
Pausing suspends this watchdog and prevents switching until Resume; cancellation
stops probing/downloading and never starts another route or installs. Switching
restarts the payload and its progress from zero; bytes from different routes are
not combined. Every attempt validates against the originally selected manifest.
Installation is invoked only after a complete verified download.

Routing is internal. The update UI retains its existing check/download/pause/
verify/install states, byte counts and speed; it shows no source names, mirror
selector, URLs or raw network errors. Manifest hashes detect corruption and
inconsistent packages. Existing native installer signature policy remains in
effect. Web/CLI source-deployment discovery and installation are unchanged.

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
pnpm --filter 9gclaw-desktop test
# Run the command matching the Mac host architecture:
pnpm --filter 9gclaw-desktop dist:mac:arm64
pnpm --filter 9gclaw-desktop dist:mac:x64
# Run the following on Windows:
pnpm --filter 9gclaw-desktop dist:win:x64
pnpm --filter 9gclaw-desktop dist:win:arm64
# On native Ubuntu 22.04 hosts with matching architectures:
pnpm --filter 9gclaw-desktop dist:linux:x64
pnpm --filter 9gclaw-desktop dist:linux:arm64
```

Local macOS builds can use ad-hoc signing. Set
`NINEGCLAW_DESKTOP_REQUIRE_SIGNING=1` to enforce production signing locally.

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
