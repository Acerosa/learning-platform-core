import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformConfig } from "../../src/core/config/platform-config.js";
import { createLearnerHeader } from "../../src/ui/learner-header/learner-header.js";
import { createNavigationShell } from "../../src/ui/navigation/navigation-shell.js";
import { createModal } from "../../src/ui/modal/modal.js";
import { createProgressCard } from "../../src/ui/progress-card/progress-card.js";
import { createActivityCard } from "../../src/ui/activity-card/activity-card.js";
import { createErrorBanner } from "../../src/ui/errors/error-banner.js";
import { createHubShell } from "../../src/ui/hub-shell/hub-shell.js";
import { createBreadcrumbs } from "../../src/ui/breadcrumbs/breadcrumbs.js";
import { createStatusBadge } from "../../src/ui/status-badge/status-badge.js";
import { createCallout } from "../../src/ui/callout/callout.js";
import { createContextPanel } from "../../src/ui/context-panel/context-panel.js";
import { createLearningOutcomeBadge } from "../../src/ui/learning-outcome-badge/learning-outcome-badge.js";
import { createSessionSection } from "../../src/ui/session-section/session-section.js";
import { createWeekView } from "../../src/ui/week-view/week-view.js";
import { SESSION_KINDS } from "../../src/ui/contracts.js";
import { readFileSync } from "node:fs";
import { dom } from "../helpers.js";

function config() {
  return createPlatformConfig({
    hubCode: "test-hub",
    hubName: "Test Hub",
    accountPath: "./account/",
    navigation: [
      { id: "home", path: "./" },
      { id: "learning", path: "./learning/" },
      { id: "activities", path: "./activities/" },
      { id: "resources", path: "./resources/" },
      { id: "progress", path: "./progress/" },
      { id: "account", path: "./account/" },
      { id: "labs", label: "Labs", path: "./labs/" }
    ]
  });
}

test("navigation renders standard and subject-specific routes with current-page state", () => {
  const runtime = dom();
  const navigation = createNavigationShell({ document: runtime.window.document, config: config(), currentId: "activities" });
  const links = Array.from(navigation.element.querySelectorAll("a"));
  assert.equal(links.some((link) => link.textContent === "Labs"), true);
  assert.equal(navigation.element.querySelector('[aria-current="page"]').textContent, "Activities");
  const toggle = navigation.element.querySelector("button");
  toggle.click();
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  navigation.element.dispatchEvent(new runtime.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
});

test("learner header is hidden when signed out and remains stable during refresh", async () => {
  const runtime = dom();
  let listener;
  const learnerContext = { subscribe(value) { listener = value; value({ status: "signed-out", context: null }); return () => {}; } };
  let signedOut = false;
  const header = createLearnerHeader({
    document: runtime.window.document,
    learnerContext,
    authService: { signOut: async () => { signedOut = true; } },
    config: config()
  });
  assert.equal(header.element.hidden, true);
  const context = { fullName: "Ada Lovelace", yearGroup: "Year 1", contactEmail: "ada@example.test" };
  listener({ status: "authenticated", context });
  assert.equal(header.element.hidden, false);
  assert.equal(header.element.textContent.includes("Test Hub"), true);
  listener({ status: "loading", context: null });
  assert.equal(header.element.textContent.includes("Ada Lovelace"), true);
  header.element.querySelector("button").click();
  await Promise.resolve();
  assert.equal(signedOut, true);
  listener({ status: "signed-out", context: null });
  assert.equal(header.element.hidden, true);
});

test("modal has an accessible name, closes on Escape, and returns focus", () => {
  const runtime = dom();
  const trigger = runtime.window.document.createElement("button");
  runtime.window.document.body.append(trigger);
  trigger.focus();
  const modal = createModal({ document: runtime.window.document, id: "test-dialog", title: "Account" });
  runtime.window.document.body.append(modal.element);
  modal.open(trigger);
  assert.equal(modal.element.getAttribute("aria-labelledby"), "test-dialog-title");
  modal.element.dispatchEvent(new runtime.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(modal.element.hasAttribute("open"), false);
  assert.equal(runtime.window.document.activeElement, trigger);
});

test("cards and errors expose semantic, learner-readable output", () => {
  const runtime = dom();
  const progress = createProgressCard({ document: runtime.window.document, title: "Course progress", completed: 3, total: 4 });
  const activity = createActivityCard({ document: runtime.window.document, title: "Practice", href: "./practice/", activityType: "Reflection" });
  const error = createErrorBanner({ document: runtime.window.document, message: "Try again later." });
  assert.equal(progress.querySelector("progress").getAttribute("aria-label"), "75% complete");
  assert.equal(activity.tagName, "ARTICLE");
  assert.equal(activity.querySelector("a").textContent, "Open activity");
  assert.equal(error.getAttribute("role"), "alert");
});

test("activity cards support start, resume and completed actions without colour-only status", () => {
  const runtime = dom();
  const started = createActivityCard({
    document: runtime.window.document,
    title: "Practice",
    href: "./practice/",
    state: "not-started",
    badge: true,
    badgeStatus: "available"
  });
  const resumed = createActivityCard({
    document: runtime.window.document,
    title: "Practice",
    href: "./practice/",
    state: "in-progress"
  });
  const done = createActivityCard({
    document: runtime.window.document,
    title: "Practice",
    href: "./practice/",
    state: "completed"
  });
  assert.equal(started.querySelector("a").textContent, "Start activity");
  assert.equal(resumed.querySelector("a").textContent, "Resume activity");
  assert.equal(done.querySelector("a").textContent, "Review activity");
  assert.match(started.textContent, /Status: Not started/);
  assert.equal(started.querySelector("[role='status']").textContent.includes("Available"), true);
});

test("supplied navigation order is preserved and brand tagline remains optional", () => {
  const runtime = dom();
  const supplied = createPlatformConfig({
    hubCode: "order-hub",
    hubName: "Order Hub",
    navigationMode: "as-supplied",
    navigation: [
      { id: "home", label: "Home", path: "./" },
      { id: "learning", label: "Weeks", path: "./weeks/" },
      { id: "assignments", label: "Assignments", path: "./assignments/" },
      { id: "account", label: "Account", path: "./account/" }
    ]
  });
  const navigation = createNavigationShell({
    document: runtime.window.document,
    config: supplied,
    currentId: "learning",
    brandTitle: "Unit Hub",
    brandTagline: "Example qualification"
  });
  const labels = Array.from(navigation.element.querySelectorAll(".lp-navigation__link")).map((link) => link.textContent);
  assert.deepEqual(labels, ["Home", "Weeks", "Assignments", "Account"]);
  assert.equal(navigation.element.querySelector(".lp-navigation__brand-title").textContent, "Unit Hub");
  assert.equal(navigation.element.querySelector(".lp-navigation__brand-tagline").textContent, "Example qualification");
  assert.equal(navigation.element.querySelector('[aria-current="page"]').textContent, "Weeks");
});

test("breadcrumbs, badges, callouts and context panels are configuration-driven", () => {
  const runtime = dom();
  const { document } = runtime.window;
  const crumbs = createBreadcrumbs({
    document,
    items: [{ label: "Home", href: "./" }, { label: "Weeks" }]
  });
  const exam = createContextPanel({
    document,
    contextType: "exam",
    heading: "Examination focus",
    items: [{ label: "Outcome", value: "LO3" }]
  });
  const assignment = createContextPanel({
    document,
    contextType: "assignment",
    heading: "Assignment context",
    action: { label: "Open workspace", href: "./assignment/" }
  });
  const callout = createCallout({ document, tone: "warning", title: "Check dates", message: "Hand-in dates appear when supplied." });
  const badge = createStatusBadge({ document, status: "in-progress" });
  const outcome = createLearningOutcomeBadge({ document, id: "LO1", title: "Programming" });
  assert.equal(crumbs.querySelector("[aria-current='page']").textContent, "Weeks");
  assert.equal(exam.dataset.contextType, "exam");
  assert.equal(assignment.dataset.contextType, "assignment");
  assert.equal(assignment.querySelector("a").getAttribute("href"), "./assignment/");
  assert.equal(callout.className.includes("lp-callout--warning"), true);
  assert.match(badge.textContent, /In progress/);
  assert.equal(outcome.textContent, "LO1 Programming");
});

test("session sections use kind variants and week view hides independent study when configured", () => {
  const runtime = dom();
  const { document } = runtime.window;
  const session = createSessionSection({
    document,
    id: "week-1-session-1",
    title: "Session 1",
    kind: "retrieval",
    defaultOpen: true,
    children: [createActivityCard({ document, title: "Starter", href: "./a/" })]
  });
  assert.equal(session.dataset.kind, "retrieval");
  assert.equal(session.open, true);
  assert.equal(SESSION_KINDS.includes("retrieval"), true);

  const week = createWeekView({
    document,
    week: { id: "week-1", teachingWeek: 1, title: "Variables", status: "available" },
    learningOutcomes: [{ id: "LO1", title: "Programming" }],
    context: {
      type: "assignment",
      heading: "What you are learning and why",
      items: [{ label: "Assignment", value: "A1 Technical guide" }]
    },
    sessions: [
      { id: "s1", title: "Session 1", kind: "session", defaultOpen: true, activities: [{ title: "Diagnostic", href: "./d/" }] },
      { id: "study", title: "Directed independent study", kind: "independent-study", activities: [{ title: "Homework", href: "./h/" }] }
    ],
    previousWeek: { label: "Previous week", href: "./week-0/" },
    nextWeek: { label: "Week 2", href: "./week-2/" },
    features: { showTitle: true, showIndependentStudy: false, showProgress: false, showExamContext: false }
  });
  assert.equal(week.querySelector("#s1").open, true);
  assert.equal(week.querySelector("#study"), null);
  assert.match(week.textContent, /LO1 Programming/);
  assert.equal(week.querySelector("[data-context-type='assignment'] h2").textContent, "What you are learning and why");
  assert.equal(week.querySelector("[rel='next']").textContent, "Week 2");
  assert.equal(week.querySelector(".lp-progress-card"), null);
});

test("week view can host supplied activity nodes and exam context without hub branches", () => {
  const runtime = dom();
  const { document } = runtime.window;
  const hosted = document.createElement("article");
  hosted.dataset.lpActivity = "example-activity";
  hosted.textContent = "Interactive activity host";
  const week = createWeekView({
    document,
    week: { id: "week-2", teachingWeek: 2, title: "Threats", status: "available" },
    features: { showTitle: false, showAssignmentContext: false, showLearningOutcomes: false },
    context: { type: "exam", heading: "Examination focus", items: [{ label: "Focus", value: "Command words" }] },
    sessions: [{ id: "s1", title: "Session 1", kind: "session", activities: [{ element: hosted }] }]
  });
  assert.match(week.textContent, /Teaching week 2/);
  assert.equal(week.querySelector("[data-context-type='exam']"), week.querySelector(".lp-context-panel"));
  assert.equal(week.querySelector("[data-lp-activity='example-activity']").textContent, "Interactive activity host");
});

test("hub shell exposes landmarks, skip link and keyboard-closable navigation", () => {
  const runtime = dom();
  const shell = createHubShell({
    document: runtime.window.document,
    config: config(),
    currentId: "home",
    pageHeader: { title: "Learning", subtitle: "Weekly journey" },
    breadcrumbs: { items: [{ label: "Home", href: "./" }, { label: "Learning" }] },
    footer: { lines: ["Example Hub"] }
  });
  runtime.window.document.body.append(shell.element);
  assert.equal(shell.element.querySelector(".lp-skip-link").getAttribute("href"), "#main-content");
  assert.equal(shell.element.querySelector("header[role='banner']").querySelector("nav").getAttribute("aria-label"), "Main navigation");
  assert.equal(shell.main.id, "main-content");
  assert.equal(shell.footer.getAttribute("role"), "contentinfo");
  const toggle = shell.element.querySelector(".lp-navigation__toggle");
  toggle.click();
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  shell.navigation.element.dispatchEvent(new runtime.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
});

test("shared CSS defines mobile, small-phone and reduced-motion contracts", () => {
  const css = readFileSync(new URL("../../src/theme/theme.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 48rem\)/);
  assert.match(css, /@media \(max-width: 24\.375rem\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /overflow-wrap: anywhere/);
});
