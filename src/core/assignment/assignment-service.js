export function createAssignmentService(api) {
  return Object.freeze({
    getAssignments: () => api.getAssignments(),
    getCurriculumDelivery: () => api.getCurriculumDelivery()
  });
}
