export function createProfileService(api) {
  return Object.freeze({ getProfile: () => api.getProfile() });
}
