const knex = require('../../config').knexDb;

function addToQuestionState(questionStateId, responseData) {
  return knex('response').insert({
    question_state_id: questionStateId,
    sql: responseData.sql,
    is_correct: responseData.is_correct,
    submitted_at: new Date()
  }).returning('*')
    .then(result => result[0]);
}

async function upsertQuestionState(responseData) {
  const questionState = await knex('question_state').first().where({
    assignment_id: responseData.assignment_id,
    question_id: responseData.question_id,
    lti_user_id: responseData.lti_user_id
  });
  if (questionState === undefined) {
    return knex('question_state').insert({
      assignment_id: responseData.assignment_id,
      question_id: responseData.question_id,
      lti_user_id: responseData.lti_user_id,
      is_correct: responseData.is_correct
    }).returning('id')
      .then(returnedValue => returnedValue[0]);
  } else if (!questionState.is_correct && questionState.is_correct !== responseData.is_correct) {
    return knex('question_state').update('is_correct', true).where('id', questionState.id).returning('id')
      .then(returnedValue => returnedValue[0]);
  } else {
    return questionState.id;
  }
}

function getResponseHistory(assignmentId, questionId, ltiUserId) {
  return knex('response as r').select('r.*').innerJoin('question_state as qs', 'qs.id', 'r.question_state_id').where({
    'qs.assignment_id': assignmentId,
    'qs.question_id': questionId,
    'qs.lti_user_id': ltiUserId
  }).orderBy('submitted_at', 'desc');
}

module.exports = { upsertQuestionState, addToQuestionState, getResponseHistory };
