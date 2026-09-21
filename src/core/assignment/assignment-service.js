export function createAssignmentService(api) {
  const hubAssignmentCache = new Map();

  async function getHubAssignments(hubCode) {
    const key = String(hubCode || "");
    const rows = await api.getHubAssignments(hubCode);
    const list = Array.isArray(rows) ? rows : [];
    if (key) hubAssignmentCache.set(key, list);
    return list;
  }

  function getCachedHubAssignments(hubCode) {
    const key = String(hubCode || "");
    if (!key || !hubAssignmentCache.has(key)) return null;
    return hubAssignmentCache.get(key);
  }

  function clearHubAssignmentCache() {
    hubAssignmentCache.clear();
  }

  return Object.freeze({
    getAssignments: () => api.getAssignments(),
    getHubAssignments,
    getCachedHubAssignments,
    clearHubAssignmentCache,
    getCurriculumDelivery: () => api.getCurriculumDelivery()
  });
}
