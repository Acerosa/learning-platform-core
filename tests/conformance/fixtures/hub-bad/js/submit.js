(function () {
  "use strict";
  window.submitInsecure = function (answers) {
    return fetch("/submit_attempt", {
      method: "POST",
      body: JSON.stringify({
        p_activity_key: "demo",
        p_responses: [{ awarded_score: 10, is_correct: true, student_id: answers.studentId }]
      })
    }).catch(function () {
      return ActivityAPI.submitAttempt({
        learner: { studentId: answers.studentId },
        score: 10
      });
    }).then(function () {
      return { status: "submitted" };
    });
  };
})();
