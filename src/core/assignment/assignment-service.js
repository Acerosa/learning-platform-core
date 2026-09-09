export function createAssignmentService(api) {
  return Object.freeze({
    getAssignments: () => api.getAssignments(),
    getHubAssignments: (hubCode) => api.getHubAssignments(hubCode),
    getCurriculumDelivery: () => api.getCurriculumDelivery()
  });
}
