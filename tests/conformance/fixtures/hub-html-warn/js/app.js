(function () {
  "use strict";
  window.render = function (mount, html) {
    mount.innerHTML = html;
  };
  window.submitSecure = function (platform, activityKey, activityVersion, responses) {
    return platform.submission.submit({
      activityKey: activityKey,
      activityVersion: activityVersion,
      responses: responses
    });
  };
})();
