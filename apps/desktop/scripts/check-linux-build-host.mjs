import { readFileSync } from "node:fs";

const expectedArch = process.argv[2];
if (process.platform !== "linux" || process.arch !== expectedArch) {
  console.error(`Build the Linux ${expectedArch} package on a native Linux ${expectedArch} host.`);
  process.exit(1);
}

const osRelease = readFileSync("/etc/os-release", "utf8");
if (!/^ID=ubuntu$/m.test(osRelease) || !/^VERSION_ID="?22\.04"?$/m.test(osRelease)) {
  console.error("Build release DEBs on Ubuntu 22.04 LTS to preserve the minimum supported glibc version.");
  process.exit(1);
}
