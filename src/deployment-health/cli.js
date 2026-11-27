#!/usr/bin/env node
import { loadPagesHealthConfig } from "./load-config.js";
import { runPagesHealthChecks, runPagesHealthFleet } from "./run.js";

function printHelp() {
  process.stdout.write(`Usage:
  deployment-health --config <path> [--skip-browser] [--require-browser]
  deployment-health --url <baseUrl> --name <name> [options]

Options:
  --config <path>          JSON config (single target or { "targets": [...] })
  --url <baseUrl>          Target Pages URL
  --name <name>            Target name
  --kind <kind>            learner-hub | admin-portal | docs-only
  --repository <owner/repo>
  --hub-code <code>
  --course-key <key>
  --expected-version <ver>
  --base-path <path>
  --skip-browser           Skip Playwright boot checks
  --require-browser        Fail when Playwright is unavailable
  --attempts <n>           Propagation retry attempts (default 6)
  --delay-ms <n>           Delay between retries (default 10000)
  --json                   Emit machine-readable JSON
`);
}

function readArg(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  return argv[index + 1] || null;
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

export async function main(argv = process.argv.slice(2)) {
  if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
    printHelp();
    return 0;
  }

  const configPath = readArg(argv, "--config");
  const skipBrowser = hasFlag(argv, "--skip-browser");
  const requireBrowser = hasFlag(argv, "--require-browser");
  const asJson = hasFlag(argv, "--json");
  const options = {
    skipBrowser,
    requireBrowser,
    githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "",
    supabaseUrl: process.env.LP_SUPABASE_URL || process.env.SUPABASE_URL || "",
    publishableKey: process.env.LP_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || ""
  };

  let targets = [];
  if (configPath) {
    targets = await loadPagesHealthConfig(configPath);
  } else {
    const url = readArg(argv, "--url");
    if (!url) {
      printHelp();
      return 2;
    }
    targets = [{
      name: readArg(argv, "--name") || url,
      kind: readArg(argv, "--kind") || "learner-hub",
      baseUrl: url,
      repository: readArg(argv, "--repository") || "",
      pages: {
        expectedSource: "workflow",
        basePath: readArg(argv, "--base-path") || ""
      },
      curriculum: {
        hubCode: readArg(argv, "--hub-code") || "",
        courseKey: readArg(argv, "--course-key") || "",
        expectedPackageVersion: readArg(argv, "--expected-version") || ""
      },
      retries: {
        attempts: Number(readArg(argv, "--attempts") || 6),
        delayMs: Number(readArg(argv, "--delay-ms") || 10_000)
      },
      boot: {
        require: requireBrowser
      }
    }];
  }

  const attempts = readArg(argv, "--attempts");
  const delayMs = readArg(argv, "--delay-ms");
  if (attempts || delayMs) {
    targets = targets.map((target) => ({
      ...target,
      retries: {
        ...(target.retries || {}),
        ...(attempts ? { attempts: Number(attempts) } : {}),
        ...(delayMs ? { delayMs: Number(delayMs) } : {})
      }
    }));
  }

  const reports = [];
  for (const target of targets) {
    reports.push(await runPagesHealthChecks(target, options));
  }
  const failed = reports.filter((report) => !report.passed);
  const fleet = {
    passed: failed.length === 0,
    reports,
    failed
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(fleet, null, 2)}\n`);
  } else {
    for (const report of fleet.reports) {
      process.stdout.write(`${report.formatted}\n\n`);
    }
    process.stdout.write(fleet.passed
      ? `Fleet result: PASS (${fleet.reports.length} target(s))\n`
      : `Fleet result: FAIL (${fleet.failed.length}/${fleet.reports.length} target(s))\n`);
  }

  return fleet.passed ? 0 : 1;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
