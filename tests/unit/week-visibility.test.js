import test from "node:test";
import assert from "node:assert/strict";
import {
  isSessionAccessible,
  isSessionAvailable,
  isWeekAvailable,
  overlayLivePackageMetadata,
  overlayLiveSessionMetadata,
  overlayLiveWeekMetadata,
  sessionsFromPublication,
  weeksFromPublication
} from "../../src/curriculum-runtime/week-visibility.js";

test("isWeekAvailable uses conservative learner-access semantics", () => {
  assert.equal(isWeekAvailable("available"), true);
  assert.equal(isWeekAvailable("AVAILABLE"), true);
  assert.equal(isWeekAvailable(" available "), true);
  assert.equal(isWeekAvailable("planned"), false);
  assert.equal(isWeekAvailable("archived"), false);
  assert.equal(isWeekAvailable(undefined), false);
  assert.equal(isWeekAvailable(null), false);
  assert.equal(isWeekAvailable(""), false);
  assert.equal(isWeekAvailable("draft"), false);
  assert.equal(isWeekAvailable("hidden"), false);
});

test("isSessionAvailable uses the same conservative semantics as weeks", () => {
  assert.equal(isSessionAvailable("available"), true);
  assert.equal(isSessionAvailable("AVAILABLE"), true);
  assert.equal(isSessionAvailable(" available "), true);
  assert.equal(isSessionAvailable("planned"), false);
  assert.equal(isSessionAvailable("archived"), false);
  assert.equal(isSessionAvailable(undefined), false);
  assert.equal(isSessionAvailable(null), false);
  assert.equal(isSessionAvailable(""), false);
  assert.equal(isSessionAvailable("draft"), false);
  assert.equal(isSessionAvailable("hidden"), false);
});

test("isSessionAccessible requires both week and session to be available", () => {
  assert.equal(isSessionAccessible("available", "available"), true);
  assert.equal(isSessionAccessible("available", "planned"), false);
  assert.equal(isSessionAccessible("planned", "available"), false);
  assert.equal(isSessionAccessible("archived", "available"), false);
  assert.equal(isSessionAccessible("available", undefined), false);
  assert.equal(isSessionAccessible("available", "mystery"), false);
  assert.equal(isSessionAccessible(undefined, "available"), false);
});

test("weeksFromPublication evaluates each week independently", () => {
  const bundled = {
    weeks: [
      { id: "week-1", metadata: { teachingWeek: 1, status: "available", title: "Week one" } },
      { id: "week-2", metadata: { teachingWeek: 2, status: "planned", title: "Week two" } },
      { id: "week-3", metadata: { teachingWeek: 3, status: "available", title: "Week three" } }
    ]
  };

  const weeks = weeksFromPublication(bundled);

  assert.equal(weeks.length, 3);
  assert.deepEqual(
    weeks.map((week) => ({ teachingWeek: week.teachingWeek, available: week.available })),
    [
      { teachingWeek: 1, available: true },
      { teachingWeek: 2, available: false },
      { teachingWeek: 3, available: true }
    ]
  );
});

test("overlayLiveWeekMetadata promotes bundled week status from live publication", () => {
  const bundled = {
    weeks: [
      {
        id: "week-3",
        metadata: { teachingWeek: 3, status: "planned", title: "Bundled week" },
        relationships: { sessions: ["session-1"] }
      }
    ],
    sessions: [{ id: "session-1", metadata: { title: "Session one" } }]
  };
  const live = {
    weeks: [{ id: "week-3", metadata: { teachingWeek: 3, status: "available", weekCommencing: "2026-09-15" } }]
  };

  const runtime = overlayLiveWeekMetadata(bundled, live);

  assert.equal(runtime.weeks[0].metadata.status, "available");
  assert.equal(runtime.weeks[0].metadata.weekCommencing, "2026-09-15");
  assert.deepEqual(runtime.weeks[0].relationships, { sessions: ["session-1"] });
  assert.equal(runtime.sessions[0].metadata.title, "Session one");
});

test("overlayLiveWeekMetadata demotes bundled week status when live publication hides it", () => {
  const bundled = {
    weeks: [{ id: "week-3", metadata: { teachingWeek: 3, status: "available" } }]
  };
  const live = {
    weeks: [{ id: "week-3", metadata: { teachingWeek: 3, status: "planned" } }]
  };

  const runtime = overlayLiveWeekMetadata(bundled, live);

  assert.equal(runtime.weeks[0].metadata.status, "planned");
  assert.equal(isWeekAvailable(runtime.weeks[0].metadata.status), false);
});

test("overlayLiveWeekMetadata matches live weeks by teachingWeek when ids differ", () => {
  const bundled = {
    weeks: [{ id: "foundations", metadata: { teachingWeek: 1, status: "planned" } }]
  };
  const live = {
    weeks: [{ id: "week-1", metadata: { teachingWeek: 1, status: "available" } }]
  };

  const runtime = overlayLiveWeekMetadata(bundled, live);

  assert.equal(runtime.weeks[0].metadata.status, "available");
});

test("weeksFromPublication overlays live metadata before normalising records", () => {
  const bundled = {
    weeks: [
      { id: "week-1", metadata: { teachingWeek: 1, status: "planned" } },
      { id: "week-5", metadata: { teachingWeek: 5, status: "planned" } }
    ]
  };
  const live = {
    weeks: [
      { id: "week-1", metadata: { teachingWeek: 1, status: "available" } },
      { id: "week-5", metadata: { teachingWeek: 5, status: "available" } }
    ]
  };

  const weeks = weeksFromPublication(bundled, live);

  assert.deepEqual(
    weeks.map((week) => week.available),
    [true, true]
  );
});

test("overlayLiveWeekMetadata returns bundled package when live publication has no weeks", () => {
  const bundled = {
    weeks: [{ id: "week-1", metadata: { teachingWeek: 1, status: "available" } }]
  };

  assert.equal(overlayLiveWeekMetadata(bundled, null), bundled);
  assert.equal(overlayLiveWeekMetadata(bundled, { weeks: [] }), bundled);
});

test("overlayLiveSessionMetadata promotes bundled session status from live publication", () => {
  const bundled = {
    weeks: [{ id: "week-1", metadata: { teachingWeek: 1, status: "available" }, relationships: { sessions: ["lesson-1"] } }],
    sessions: [{
      id: "lesson-1",
      version: "0.1.0",
      metadata: { title: "Annotating the client brief", kind: "session", status: "planned" },
      relationships: { week: "week-1", activities: ["act-1"] }
    }],
    activities: [{ id: "act-1", metadata: { title: "Starter" } }]
  };
  const live = {
    sessions: [{ id: "lesson-1", metadata: { status: "available", title: "Live title must not replace" } }]
  };

  const runtime = overlayLiveSessionMetadata(bundled, live);

  assert.equal(runtime.sessions[0].metadata.status, "available");
  assert.equal(runtime.sessions[0].metadata.title, "Annotating the client brief");
  assert.equal(runtime.sessions[0].version, "0.1.0");
  assert.deepEqual(runtime.sessions[0].relationships, { week: "week-1", activities: ["act-1"] });
  assert.equal(runtime.activities[0].id, "act-1");
  assert.equal(runtime.weeks[0].relationships.sessions[0], "lesson-1");
});

test("overlayLiveWeekMetadata overlays session status in the same package pass", () => {
  const bundled = {
    weeks: [{ id: "week-1", metadata: { teachingWeek: 1, status: "planned" } }],
    sessions: [{
      id: "lesson-2",
      metadata: { title: "Market, problems and risks", status: "planned" },
      relationships: { week: "week-1", activities: ["act-2"] }
    }]
  };
  const live = {
    weeks: [{ id: "week-1", metadata: { teachingWeek: 1, status: "available" } }],
    sessions: [{ id: "lesson-2", metadata: { status: "available" } }]
  };

  const runtime = overlayLivePackageMetadata(bundled, live);

  assert.equal(runtime.weeks[0].metadata.status, "available");
  assert.equal(runtime.sessions[0].metadata.status, "available");
  assert.deepEqual(runtime.sessions[0].relationships, { week: "week-1", activities: ["act-2"] });
  assert.equal(runtime.sessions[0].metadata.title, "Market, problems and risks");
});

test("session availability does not override a planned week", () => {
  const bundled = {
    weeks: [{ id: "week-1", metadata: { teachingWeek: 1, status: "planned", title: "Week one" } }],
    sessions: [{
      id: "lesson-1",
      metadata: { title: "Lesson 1", status: "planned" },
      relationships: { week: "week-1" }
    }]
  };
  const live = {
    weeks: [{ id: "week-1", metadata: { teachingWeek: 1, status: "planned" } }],
    sessions: [{ id: "lesson-1", metadata: { status: "available" } }]
  };

  const runtime = overlayLiveWeekMetadata(bundled, live);
  const weekStatus = runtime.weeks[0].metadata.status;
  const sessionStatus = runtime.sessions[0].metadata.status;

  assert.equal(isWeekAvailable(weekStatus), false);
  assert.equal(isSessionAvailable(sessionStatus), true);
  assert.equal(isSessionAccessible(weekStatus, sessionStatus), false);
});

test("sessionsFromPublication reports mixed session statuses after live overlay", () => {
  const bundled = {
    weeks: [{ id: "week-1", metadata: { teachingWeek: 1, status: "available" } }],
    sessions: [
      { id: "s1", metadata: { title: "Lesson 1", status: "planned", kind: "session" }, relationships: { week: "week-1" } },
      { id: "s2", metadata: { title: "Homework", status: "planned", kind: "homework" }, relationships: { week: "week-1" } }
    ]
  };
  const live = {
    sessions: [
      { id: "s1", metadata: { status: "available" } },
      { id: "s2", metadata: { status: "planned" } }
    ]
  };

  const sessions = sessionsFromPublication(bundled, live);
  assert.deepEqual(
    sessions.map((session) => ({ id: session.id, available: session.available, kind: session.kind })),
    [
      { id: "s1", available: true, kind: "session" },
      { id: "s2", available: false, kind: "homework" }
    ]
  );
});
