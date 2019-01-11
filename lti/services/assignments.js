const knex = require('../../config').knexDb;
const { groupBy } = require('lodash');

function getAssignments() {
  return knex
    .select('a.id', 'a.name', 'a.year', 'a.course', 'a.description')
    .count({ nb: 'aq.assignment_id' })
    .from('assignments AS a')
    .leftJoin('assignment_questions AS aq', 'a.id', 'aq.assignment_id')
    .groupBy('a.id', 'a.name', 'a.year', 'a.course', 'a.description')
    .orderBy('a.name', 'asc').orderBy('nb');
}

function getAssignment(id) {
  return knex.first().from('assignments').where('id', id);
}

async function getAssignmentWithQuestionList(req, res, next) {
  try {
    const [assignment, questions] = await Promise.all([
      getAssignment(req.params.id),
      getQuestionsWithState(req.params.id, req.session.lti.user.id)
    ]);
    if (assignment === undefined) {
      throw new Error(`Unable to find an assignment with this id : ${req.params.id}.`);
    }
    if (questions.length === 0) {
      throw new Error(`The assignment with id ${req.params.id} does not have any related questions.`);
    }
    assignment.questions = questions;
    res.assignmentData = assignment;
    next();
  } catch (reason) {
    next(reason);
  }
}

function getQuestionsWithState(assignmentId, ltiUserId) {
  const filteredState = knex('question_state').select('is_correct', 'question_id').where('lti_user_id', ltiUserId).as('qst');
  return knex('question_schemas AS qs')
    .select('qs.*', 'qst.*')
    .innerJoin('assignment_questions AS aq', 'aq.question_id', 'qs.id')
    .leftJoin(filteredState, 'qst.question_id', 'qs.id')
    .where('aq.assignment_id', assignmentId)
    .orderBy('aq.aq_order');
}

function getQuestionsState(assignementId, litUserId) {
  const filteredResponse = knex('response').select('question_id', 'value', 'is_correct', 'position').where('lti_user_id', litUserId).as('r');
  return knex('question_schemas AS qs')
    .select('qs.*', 'aq.aq_order', 'r.value', 'r.is_correct', 'r.position')
    .innerJoin('assignment_questions AS aq', 'aq.question_id', 'qs.id')
    .leftJoin(filteredResponse, 'r.question_id', 'qs.id')
    .andWhere('aq.assignment_id', assignementId)
    .orderBy('aq.aq_order')
    .orderBy('r.position');
}

async function getAssignmentState(req, res, next) {
  try {
    const [assignment, responses] = await Promise.all([
      getAssignment(req.params.id),
      getQuestionsState(req.params.id, req.session.lti.user.id)
    ]);
    if (assignment === undefined) {
      throw new Error(`Unable to find an assignment with this id : ${req.params.id}.`);
    }
    if (responses.length === 0) {
      throw new Error(`The assignment with id ${req.params.id} does not have any related questons.`);
    }
    assignment.questions = responses;
    res.assignmentData = assignment;
    next();
  } catch (reason) {
    next(reason);
  }
}

module.exports = { getAssignment, getAssignments, getAssignmentWithQuestionList, getQuestionsWithState, getAssignmentState };
