(function () {
  "use strict";
  window.submitSecure = function (platform, activityKey, activityVersion, responses) {
    if (!platform.auth.isSignedIn()) return Promise.reject(new Error("Sign in first"));
    return platform.submission.submit({
      activityKey: activityKey,
      activityVersion: activityVersion,
      responses: responses
    });
  };
})();
