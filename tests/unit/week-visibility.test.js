import test from "node:test";
import assert from "node:assert/strict";
import {
  isWeekAvailable,
  overlayLiveWeekMetadata,
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
