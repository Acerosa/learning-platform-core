export function createProgressService(api) {
  return Object.freeze({
    getProgress: (activityKey) => api.getProgress(activityKey),
    getAttempts: (activityKey) => api.getAttempts(activityKey),
    getResponses: (activityKey) => api.getResponses(activityKey)
  });
}
