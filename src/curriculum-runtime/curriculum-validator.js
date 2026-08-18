export function createCurriculumValidator({ validatePackage } = {}) {
  function validate(pkg) {
    if (!pkg || typeof pkg !== "object") {
      return { valid: false, issues: [{ code: "INVALID_PUBLICATION", path: "package", message: "published package is missing" }] };
    }
    if (typeof validatePackage === "function") {
      const result = validatePackage(pkg);
      if (result && result.valid === false) return result;
      if (result && result.valid === true) return result;
    }
    if (!pkg.hub || !pkg.curriculum) {
      return { valid: false, issues: [{ code: "INVALID_PUBLICATION", path: "package", message: "hub and curriculum are required" }] };
    }
    return { valid: true, issues: [] };
  }

  return Object.freeze({ validate });
}
