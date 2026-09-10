const ENROLLED_STATUSES = Object.freeze([
  "enrolled",
  "enrolled_created",
  "enrolled_reactivated"
]);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isHubEnrolledStatus(status) {
  return ENROLLED_STATUSES.includes(clean(status));
}

function mapAccess(row) {
  if (!row || typeof row !== "object") {
    return Object.freeze({
      status: "no_enrolment",
      idempotent: true,
      academicYear: "",
      yearGroup: "",
      courseTitle: "",
      groupCode: "",
      groupName: "",
      enrolmentStatus: "",
      registrationOption: ""
    });
  }
  return Object.freeze({
    status: clean(row.status) || "no_enrolment",
    idempotent: row.idempotent !== false,
    academicYear: clean(row.academic_year ?? row.academicYear),
    yearGroup: clean(row.year_group ?? row.yearGroup),
    courseTitle: clean(row.course_title ?? row.courseTitle),
    groupCode: clean(row.group_code ?? row.groupCode),
    groupName: clean(row.group_name ?? row.groupName),
    enrolmentStatus: clean(row.enrolment_status ?? row.enrolmentStatus),
    registrationOption: clean(row.registration_option ?? row.registrationOption)
  });
}

export function createHubAccessService({ api, hubCode, courseKey } = {}) {
  async function resolve() {
    const rows = await api.resolveLearnerHubAccess({
      p_hub_code: hubCode,
      p_course_key: courseKey
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return mapAccess(row);
  }

  async function join(classKey) {
    const rows = await api.joinLearnerHubGroup({
      p_hub_code: hubCode,
      p_class_key: clean(classKey).toLowerCase()
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return mapAccess(row);
  }

  return Object.freeze({
    resolve,
    join,
    isEnrolled: isHubEnrolledStatus
  });
}
