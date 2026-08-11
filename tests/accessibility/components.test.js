import test from "node:test";
import assert from "node:assert/strict";
import axe from "axe-core";
import { createPlatformConfig } from "../../src/core/config/platform-config.js";
import { createNavigationShell } from "../../src/ui/navigation/navigation-shell.js";
import { createProgressCard } from "../../src/ui/progress-card/progress-card.js";
import { createActivityCard } from "../../src/ui/activity-card/activity-card.js";
import { createErrorBanner } from "../../src/ui/errors/error-banner.js";
import { dom } from "../helpers.js";

test("representative shared components pass automated structural accessibility checks", async () => {
  const runtime = dom("<!doctype html><html lang=\"en\"><head><title>Component accessibility test</title></head><body><main></main></body></html>");
  const { document } = runtime.window;
  const config = createPlatformConfig({
    hubCode: "test-hub",
    hubName: "Test Hub",
    navigation: [
      { id: "home", path: "./" },
      { id: "activities", path: "./activities/" },
      { id: "account", path: "./account/" }
    ]
  });
  document.querySelector("main").append(
    createNavigationShell({ document, config, currentId: "home" }).element,
    createProgressCard({ document, title: "Progress", completed: 1, total: 3 }),
    createActivityCard({ document, title: "Reflection", description: "Describe what you learned.", href: "./activity/" }),
    createErrorBanner({ document, message: "Try again." })
  );
  runtime.window.eval(axe.source);
  const results = await runtime.window.axe.run(document, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } }
  });
  assert.equal(results.violations.length, 0, results.violations.map((violation) => violation.id).join(", "));
});
