export function createProfileService(api) {
  return Object.freeze({
    async getProfile() {
      // Link Auth→roster when contact_email uniquely matches before profile read.
      if (typeof api.ensureLearnerAuthLink === "function") {
        try {
          await api.ensureLearnerAuthLink();
        } catch {
          // Non-fatal: profile read still decides onboarding-required vs authenticated.
        }
      }
      return api.getProfile();
    }
  });
}
