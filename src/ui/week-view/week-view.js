import { createElement } from "../dom.js";
import { createActivityCard } from "../activity-card/activity-card.js";
import {
  isIndependentKind,
  mergeWeekUiFeatures,
  shouldShowContext
} from "../contracts.js";
import { createContextPanel } from "../context-panel/context-panel.js";
import { createEmptyState } from "../empty-state/empty-state.js";
import { createProgressCard } from "../progress-card/progress-card.js";
import { createSessionSection } from "../session-section/session-section.js";
import { SESSION_KIND_LABELS } from "../contracts.js";
import { createWeekHeader } from "../week-header/week-header.js";
import { createWeekNavigation } from "../week-navigation/week-navigation.js";

function activityNode(document, activity, renderActivity) {
  if (activity?.element) return activity.element;
  if (typeof renderActivity === "function") return renderActivity(activity);
  return createActivityCard({ document, ...activity });
}

function sessionMeta(session) {
  if (session.meta) return session.meta;
  const count = (session.activities || []).length;
  const countLabel = `${count} ${count === 1 ? "activity" : "activities"}`;
  const kindLabel = SESSION_KIND_LABELS[session.kind] || SESSION_KIND_LABELS.session;
  return session.kind && session.kind !== "session" ? `${kindLabel} · ${countLabel}` : countLabel;
}

export function createWeekView({
  document = globalThis.document,
  week = {},
  learningOutcomes = [],
  context = null,
  sessions = [],
  progress = null,
  previousWeek,
  nextWeek,
  features = {},
  renderActivity
} = {}) {
  const ui = mergeWeekUiFeatures(features);
  const element = createElement(document, "div", {
    className: "lp-week",
    dataset: { week: week.id || "" }
  });

  element.append(createWeekHeader({
    document,
    teachingWeek: week.teachingWeek,
    title: week.title,
    subtitle: week.subtitle,
    status: week.status,
    learningOutcomes: ui.showLearningOutcomes ? learningOutcomes : [],
    headingLevel: week.headingLevel || 1,
    showTitle: ui.showTitle !== false
  }));

  if (context && shouldShowContext(ui, context.type || context.contextType)) {
    element.append(createContextPanel({
      document,
      contextType: context.type || context.contextType,
      heading: context.heading,
      items: context.items || [],
      description: context.description,
      action: context.action
    }));
  }

  const visibleSessions = sessions.filter((session) => {
    if (ui.showIndependentStudy === false && isIndependentKind(session.kind)) return false;
    return true;
  });

  if (!visibleSessions.length) {
    element.append(createEmptyState({
      document,
      heading: "Planned teaching week",
      message: week.emptyMessage || "Detailed session activities for this week have not been added yet.",
      action: week.emptyAction
    }));
  } else {
    visibleSessions.forEach((session) => {
      const children = (session.activities || []).map((activity) => activityNode(document, activity, renderActivity));
      element.append(createSessionSection({
        document,
        id: session.id,
        title: session.title,
        kind: session.kind,
        summary: session.summary,
        defaultOpen: session.defaultOpen,
        meta: sessionMeta(session),
        children
      }));
    });
  }

  if (ui.showProgress && progress) {
    element.append(createProgressCard({ document, ...progress }));
  }

  const navigation = createWeekNavigation({ document, previousWeek, nextWeek });
  if (navigation) element.append(navigation);

  return element;
}
