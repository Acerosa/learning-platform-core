# Shared hub UI primitives

Core owns learner chrome and week/session/activity **presentation**. Curriculum data, block rendering and subject copy stay in `@learning-platform/content` and each hub.

Standardise the grammar, not the personality. Hubs keep primary/accent branding, contextual labels and course identity through configuration.

## Existing primitives (extended)

| Factory | Role |
| --- | --- |
| `createLearnerHeader` | Signed-in learner summary |
| `createNavigationShell` | Primary navigation, mobile menu, optional theme control |
| `createActivityCard` | Outer activity listing card |
| `createProgressCard` | Numeric progress summary |
| `createEmptyState` | Planned/empty region |
| `createLoadingState` | Pending region |
| `createErrorBanner` | Error state (do not add a second ErrorState factory) |

## New primitives in 0.2.0

| Factory | Role |
| --- | --- |
| `createHubShell` | Skip link, banner, optional learner header, breadcrumbs, page header, main, footer |
| `createBreadcrumbs` | Ordered trail |
| `createWeekHeader` | Teaching week title, status, optional learning-outcome badges |
| `createWeekNavigation` | Previous/next week links |
| `createWeekView` | Composed week presentation contract |
| `createSessionSection` | One session container for all canonical kinds |
| `createContextPanel` | Exam / assignment / project context, data-driven |
| `createLearningOutcomeBadge` | Compact outcome chip |
| `createStatusBadge` | Status with text, not colour alone |
| `createCallout` | Info/success/warning/error aside |

`ResourceList` is not extracted. Resource pages still differ by hub.

## Configuration, not hub branches

Do not write `if (hub === "unit14")`. Pass presentation data and feature flags:

```js
const week = createWeekView({
  week: { id: "week-1", teachingWeek: 1, title: "Variables", status: "available" },
  learningOutcomes: [{ id: "LO1", title: "Programming" }],
  context: {
    type: "assignment", // or "exam" | "project"
    heading: "What you are learning and why",
    items: [{ label: "Assignment", value: "A1 Technical guide" }],
    action: { label: "Open workspace", href: "./assignments/assignment-1/" }
  },
  sessions: [
    { id: "session-1", title: "Session 1", kind: "session", defaultOpen: true, activities: [] },
    { id: "study", title: "Independent study", kind: "independent-study", activities: [] }
  ],
  previousWeek: { label: "Previous week", href: "./week-0/" },
  nextWeek: { label: "Week 2", href: "./week-2/" },
  features: {
    showTitle: false,
    showLearningOutcomes: true,
    showAssignmentContext: true,
    showExamContext: false,
    showProjectContext: false,
    showIndependentStudy: true,
    showProgress: false
  },
  renderActivity(activity) {
    return content.renderActivityNode(activity);
  }
});
```

`WEEK_UI_FEATURES` supplies defaults. Hubs override only what their course model needs.

Canonical session kinds: `session`, `independent-study`, `homework`, `revision`, `retrieval`. Style and label through `data-kind`, not separate components.

## Week presentation contract

`createWeekView` consumes a **presentation** object, not a Content envelope:

- week title, teaching week, status
- learning outcomes as `{ id, title }`
- optional context panel
- session list with activities
- independent study/homework as session kinds
- optional progress card
- previous/next week navigation

Map `@learning-platform/content` `resolveWeek()` in the hub. Core must not import Content schemas, OCR labels, P/M/D language or question banks.

Activity **interiors** (blocks, drafts, submit) remain in Content. Pass a pre-rendered `activity.element` or `renderActivity` callback.

## Navigation order

`createPlatform({ navigationMode: "standard" })` is the default and still prepends the six standard IDs.

`navigationMode: "as-supplied"` keeps the hub array order. Use it when Weeks, Assignments or Tasks must appear before unused standard routes. Conformance still **warns** if standard IDs are absent; it does not fail the hub.

`createNavigationShell` accepts `brandTitle`, `brandTagline`, `currentIds` and an `actions` node for account controls.

## Theming

Keep `--hub-primary` and `--hub-accent`. Shared layout uses `--lp-*` tokens. Do not add a second CSS system in the hub.

## Accessibility and responsive behaviour

Shared UI must preserve:

- skip link, banner, main, contentinfo
- heading hierarchy inside week/session views
- keyboard-operable mobile menu with Escape
- visible `:focus-visible`
- status text, not colour alone
- `prefers-reduced-motion`
- no horizontal overflow at desktop, tablet, and ~375–390px (`24.375rem`)
