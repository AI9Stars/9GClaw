# RPM desktop support

This fork packages only Windows x64 and ARM64. The following is retained
upstream implementation guidance, not an enabled build or release target.
Linux package scripts, builder targets, feeds and workflows must be restored
and validated together before these commands can be used.

The upstream RPM build baseline is Rocky Linux 9 (glibc 2.34), with
native architecture-matched CI runners. The target family is RHEL 9+, Rocky Linux
9+, AlmaLinux 9+, and Fedora desktops. RHEL 8 and older are outside this baseline.
A build baseline does not certify every distribution or desktop environment;
verify each supported release on its target desktop.

## Build and installation

Build in a Rocky Linux 9 container on the matching CPU architecture:

```bash
# As root, install the packaging/native-module toolchain:
bash apps/desktop/scripts/install-rpm-build-deps.sh
# Install Node.js 22.23.1 and pnpm 10.32.1, then:
pnpm install --frozen-lockfile
USE_SYSTEM_FPM=true pnpm --filter 9gclaw-desktop dist:linux:rpm:x64
# Or, on ARM64:
USE_SYSTEM_FPM=true pnpm --filter 9gclaw-desktop dist:linux:rpm:arm64
```

The installer names use `linux-x64.rpm` and `linux-arm64.rpm`; their RPM header
architectures are `x86_64` and `aarch64`. Install with the system package manager
so the declared Git, GTK3, audio, GBM, NSS, notification, Secret Service and X11
library dependencies are resolved:

```bash
sudo dnf install ./9GClaw-VERSION-linux-arm64.rpm
# Substitute linux-x64.rpm on x64 devices. yum is supported on RHEL systems too.
```

The app installs at `/opt/9GClaw`, with a desktop launcher and hicolor icon.
RPM payloads use gzip compression to keep memory use practical on 4 GB build
VMs. Its Node.js runtime and native SQLite, bcrypt, image and terminal modules are
bundled. Linux menus, localization, appearance and window chrome share the
existing DEB implementation. Tray visibility depends on the desktop's status
icon host; standard GNOME may need an extension for status icons.

## Updates and release gates

The installed `resources/package-type` selects `RpmUpdater` or `DebUpdater`.
RPM clients accept only their own architecture's RPM payload and use
`latest-rpm-linux.yml` (x64) or `latest-rpm-linux-arm64.yml` (ARM64). DEB feeds
retain their existing names. Each downloaded payload is verified against the
unified release manifest and SHA256/SHA512 checksums before installation.
The RPM updater installs through the system package manager with elevated
authorization; the current dependency tries dnf/yum after zypper.

This repository's GitHub Actions publish only Windows x64 and ARM64. Linux
packaging targets, commands, workflows and release feeds are not enabled.
Shared source and helper scripts alone do not establish a Linux release.


References: [electron-builder Linux targets](https://www.electron.build/v26/docs/linux/),
[RpmUpdater](https://www.electron.build/v26/docs/api/electron-updater.class.rpmupdater/).
