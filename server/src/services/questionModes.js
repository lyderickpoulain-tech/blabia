// Mode de questions : combien de cartes de décision les agents peuvent soumettre
// à l'humain dans une réunion. Au-delà du budget, ils tranchent par hypothèse
// explicite (que l'humain peut contredire). Project.questionMode = défaut du
// projet ; Session.questionMode (nullable) = surcharge pour une réunion.
const QUESTION_MODES = {
  delegate: { budget: 4,  label: 'Je délègue' },
  balanced: { budget: 8,  label: 'Équilibré' },
  control:  { budget: 15, label: 'Je veux tout trancher' },
};
const DEFAULT_QUESTION_MODE = 'balanced';

const isQuestionMode = (v) => Object.prototype.hasOwnProperty.call(QUESTION_MODES, v);

function effectiveQuestionMode(session, project) {
  if (isQuestionMode(session?.questionMode)) return session.questionMode;
  if (isQuestionMode(project?.questionMode)) return project.questionMode;
  return DEFAULT_QUESTION_MODE;
}

function decisionBudgetFor(session, project) {
  return QUESTION_MODES[effectiveQuestionMode(session, project)].budget;
}

module.exports = { QUESTION_MODES, DEFAULT_QUESTION_MODE, isQuestionMode, effectiveQuestionMode, decisionBudgetFor };
