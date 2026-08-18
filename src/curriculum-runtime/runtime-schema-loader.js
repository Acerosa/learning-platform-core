import { SUPPORTED_PACKAGE_VERSION, SUPPORTED_SCHEMA_VERSION } from "./constants.js";

export function createRuntimeSchemaLoader({
  supportedSchemaVersion = SUPPORTED_SCHEMA_VERSION,
  supportedPackageVersion = SUPPORTED_PACKAGE_VERSION
} = {}) {
  function inspect(row, pkg = row?.package) {
    const schemaVersion = row?.schema_version || row?.schemaVersion || pkg?.schemaVersion || "";
    const packageVersion = row?.source_package_version || row?.sourcePackageVersion
      || pkg?.schemaVersion || "";
    return Object.freeze({
      schemaVersion,
      packageVersion,
      supportedSchemaVersion,
      supportedPackageVersion,
      compatible: (!schemaVersion || schemaVersion === supportedSchemaVersion)
        && (!packageVersion || packageVersion === supportedPackageVersion)
    });
  }

  return Object.freeze({ inspect, supportedSchemaVersion, supportedPackageVersion });
}
