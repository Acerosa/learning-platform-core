export function createSessionService(authService) {
  return Object.freeze({
    restore: () => authService.initialise(),
    subscribe: (listener) => authService.subscribe(listener),
    getSession: () => authService.getSession(),
    hasActiveSession: () => authService.isSignedIn(),
    signOut: () => authService.signOut()
  });
}
