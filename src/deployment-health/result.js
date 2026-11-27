export function checkResult(id, passed, message, severity = "error", details = null) {
  return Object.freeze({
    id,
    passed: Boolean(passed),
    severity,
    message: String(message || ""),
    details: details == null ? null : Object.freeze(details)
  });
}

export function summariseChecks(results) {
  const list = Array.isArray(results) ? results : [];
  const errors = list.filter((item) => !item.passed && item.severity === "error").length;
  const warnings = list.filter((item) => !item.passed && item.severity === "warning").length;
  return Object.freeze({
    passed: errors === 0,
    errors,
    warnings,
    results: Object.freeze(list.map((item) => Object.freeze(item)))
  });
}

export function formatHealthReport(report, { targetName = "" } = {}) {
  const lines = [];
  const title = targetName ? `Pages health: ${targetName}` : "Pages health";
  lines.push(`${title} — ${report.passed ? "PASS" : "FAIL"} (${report.errors} error(s), ${report.warnings} warning(s))`);
  for (const item of report.results || []) {
    const mark = item.passed ? "OK" : item.severity === "warning" ? "WARN" : "FAIL";
    lines.push(`  [${mark}] ${item.id}: ${item.message}`);
  }
  return lines.join("\n");
}
