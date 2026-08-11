export function createEnrolmentService(api) {
  return Object.freeze({ getEnrolments: () => api.getEnrolments() });
}
