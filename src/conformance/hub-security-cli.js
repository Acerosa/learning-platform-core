import { assertHubSecurityBaseline, formatHubSecurityReport, scanHubSecurity } from "./hub-security-scanner.js";

const root = process.argv[2] ? process.argv[2] : process.cwd();
const report = scanHubSecurity(root);
process.stdout.write(`${formatHubSecurityReport(report)}\n`);
if (!report.passed) {
  try {
    assertHubSecurityBaseline(root);
  } catch {
    process.exitCode = 1;
  }
}
