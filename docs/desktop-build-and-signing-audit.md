# Desktop build and release audit

## Current fork policy

The Desktop PR workflow runs Windows regression checks, then reuses the same
x64/ARM64 packaging job as manual Windows Release. Both native runners build
and verify real NSIS installers. PR artifacts are test outputs; only the manual
Release workflow publishes to GitHub after both architectures succeed.

Windows packages are unsigned. Signing tools, certificate discovery and signing
secrets are removed. `win.signExecutable=false` retains icon/version editing
while disabling signing. `win.verifyUpdateCodeSignature=false` allows unsigned
updates; SHA-256/SHA-512 checks still protect download integrity. Bundled
third-party executables retain their existing upstream signatures.

The runtime updater has a single GitHub source. OBS upload/retention tooling,
mirror routing and route-cache persistence have been removed. Non-Windows
packaging configuration and commands are disabled for this fork.

## Windows startup reliability

The Windows audit covers the first Electron process, its bundled Node services,
native dependencies, process containment and filesystem paths. The following
issues were reproduced locally and now have regression coverage:

| Failure | Handling and verification |
| --- | --- |
| A global `NODE_OPTIONS` prevents Electron from reaching JavaScript bootstrap | Disable Electron's Node-options fuse during packaging, before signing. A real copied Electron executable rejects an invalid inherited option before the change and reaches app readiness afterward. Published-package smoke checks the actual executable fuse. |
| Stale `NODE_OPTIONS`/`NODE_PATH` or `ELECTRON_RUN_AS_NODE` break a packaged Node service | Clear these only for the app-owned packaged runtime environment. Preserve development flags, proxy configuration and `NODE_EXTRA_CA_CERTS` for bundled Node services. |
| Both `PATH` and `Path` are present and the wrong spelling wins | Normalize Windows environment keys before prepending bundled Node/Git. Test real command lookup with stale paths and a failing preload, including a Unicode/space/punctuation installation path. |
| Preferred loopback ports are occupied or denied | Try the preferred port, then OS-assigned ephemeral ports, at most three probes. Do not allocate the same Web/Gateway port. Preserve the final error code instead of retrying indefinitely. |
| Synchronous native directory copying corrupts a Chinese path | Use the JS/libuv copy implementation on Windows, preserve caller filters/overwrite options, and use `copyFileSync` for individual startup assets. Tests verify exact directory names and binary contents. |

The native lifecycle fixture now places the complete app, profile and runtime
under a Windows path containing Chinese characters, spaces, `&` and parentheses.
Production packaging retains its existing executable-architecture, bundled
Node/Git/Bash, SQLite/bcrypt/sharp/PTY, native process-host and installer checks.
The copy workaround is limited to build/fixture files; it does not change
business file operations or relax workspace boundaries.

The Electron fuse also disables `NODE_EXTRA_CA_CERTS` in Electron itself, as
documented upstream. Electron networking uses its platform certificate trust;
the bundled Node services still receive the configured custom CA and proxies.
Global user/machine environment settings are not modified.

Some failures remain dependent on the installation environment: an unavailable
or quarantined executable, unsigned releases, denied profile/TEMP access, disk
exhaustion and native GPU/driver failures. A protected Documents folder can also
reject the General workspace. Inspect the actual runtime diagnostic and Windows
Security Protection History before changing permissions or reinstalling. Keep
profile data and existing conversations when diagnosing startup problems.

Primary references: [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses),
[Node 22 child-process environment rules](https://nodejs.org/download/release/v22.23.1/docs/api/child_process.html),
[Windows socket errors](https://learn.microsoft.com/en-us/windows/win32/winsock/windows-sockets-error-codes-2),
[Controlled folder access](https://learn.microsoft.com/en-us/defender-endpoint/controlled-folder-access-overview),
and [Node's Windows Unicode copy reports](https://github.com/nodejs/node/issues/54476).
