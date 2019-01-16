const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const { pick, merge } = require('lodash');

const config = require('../config');
const { ltiRequestValidator, ltiSessionValidator, ltiXAssignmentValidator, ltiInstructorValidator } = require('./route-validators');
const LtiContentItemLink = require('./models/lti-content-item-link.class');
const ResponseFormData = require('./models/response-form-data.class');
const assignmentService = require('../lti/services/assignments');
const ltiUserService = require('./services/lti-user');
const responseService = require('./services/responses');
const questionService = require('./services/questions');
const { LtiSessionError } = require('./utils/custom-errors');

const router = express.Router();

router.use(session(merge({ store: new RedisStore() }, config.session)));
router.use(express.urlencoded());
router.use(express.json());

/**
 * Route that should be accessed by the LTI Tool Coonsumer when a user wants to select a Tool activity
 * It renders the `item-selection` templates containing the list of all the available assignments.
 */
router.post('/select',
  ltiRequestValidator,
  async (req, res) => {
    res.render('item-selection', { assignments: await assignmentService.getAssignments(), selectedUrl: `${config.app.rootUrl}/lti/selected` });
  }
);

/**
 * Route that should be accessed by the LTI Tool Consumer when a user has selected an assignment.
 * It sends an LTI Response to the TC that contains the properties of the selected assignment.
 */
router.post('/selected',
  ltiSessionValidator,
  async (req, res) => {
    const returnUrl = req.session.lti.rawData.content_item_return_url;
    const consumer = req.session.lti.consumer;
    const assignment = await assignmentService.getAssignment(req.body.id);
    const itemCustomValues = {
      assignment_id: assignment.id,
      start_date: Boolean(req.body.startDate) ? req.body.startDate : undefined,
      end_date: Boolean(req.body.endDate) ? req.body.endDate : undefined
    }
    const item = new LtiContentItemLink(assignment.name, assignment.description, itemCustomValues);
    const formData = new ResponseFormData(returnUrl, consumer, item);
    res.render('item-selected', formData.signedWith(consumer));
  }
);

/**
 * This is the entry point of any LTI assignment.
 * It check the access rights and then redirect to the requested assignment.
 */
router.post('/launch',
  ltiRequestValidator,
  ltiUserService.upsert,
  (req, res, next) => {
    req.session.save((err) => {
      if (err) next(err);
      res.redirect(`${config.app.frontUrl}/#/assignment/${req.session.lti.rawData.custom_assignment_id}`);
    });
  }
);

/**
 * **This route can only be accessed if the user accessed the assignment through an LTI Launch Request.**
 *
 * Loads an assignment based on its `:id`.
 * If one tries to access this route directly, an error will be shown instead.
 */
router.get('/assignment/:id',
  ltiSessionValidator,
  ltiXAssignmentValidator,
  assignmentService.getAssignmentWithQuestionList,
  // assignmentService.getAssignmentState,
  (req, res) => {
    res.json(res.assignmentData);
  }
);

/**
 * **This route can only be accessed if the user accessed the assignment through an LTI Launch Request.**
 *
 * Route called by the front-end when a user submit their response to a specific SQL question.
 * It saves the response in the DB and, if neceserry, notifiy the TC that the user's note should be updated.
 */
router.post('/assignment/:id/question/:qId/response',
  ltiSessionValidator,
  ltiXAssignmentValidator,
  async (req, res, next) => {
    // User id is retrieve from the session
    const userId = req.session.lti.user.id;
    if (!userId) next(new LtiSessionError('Unable to retrieve your identity from the session data.'));
    // Body must contain : sql, isCorrect
    if (req.body.sql === undefined || req.body.isCorrect === undefined) next(new Error('The request body does not contains the expected keys'));
    const responseData = {
      assignment_id: req.params.id,
      question_id: req.params.qId,
      lti_user_id: userId,
      sql: req.body.sql,
      position: req.body.position,
      is_correct: req.body.isCorrect
    }
    try {
      let response;
      if (ltiUserService.isInstructor(req.session.lti)) {
        response = pick(responseData, [ 'sql', 'is_correct' ]);
      } else {
        if (req.body.userScore) await ltiUserService.updateScore(req.body.userScore, req.session.lti);
        const questionStateId = await responseService.upsertQuestionState(responseData);
        response = await responseService.addToQuestionState(questionStateId, responseData);
      }
      res.json({ saved: true, history: response });
    } catch (err) {
      console.log(err);
      res.status(500).json({ saved: false, error: err });
    }
  }
);

/**
 * **This route can only be accessed if the user accessed the assignment through an LTI Launch Request.**
 *
 * Route that allows to retrieve a user's question history, that is all the responses they submitted for this question of this assignment.
 */
router.get('/assignment/:id/question/:qId/history',
  ltiSessionValidator,
  ltiXAssignmentValidator,
  async (req, res, next) => {
    try {
      const history = await responseService.getResponseHistory(req.params.id, req.params.qId, req.session.lti.user.id);
      res.json(history);
    } catch (error) {
      res.status(500).json([]);
    }
  }
);

router.get('/assignment/:id/question/:qId/solution',
  ltiSessionValidator,
  ltiXAssignmentValidator,
  ltiInstructorValidator,
  async (req, res, next) => {
    try {
      const questionSolution = await questionService.getSolution(req.params.qId);
      res.send(questionSolution);
    } catch (err) {
      res.status(500).json(err);
    }
  }
)

/**
 * **This route can only be accessed if the user accessed the assignment through an LTI Launch Request.**
 *
 * Send all the current user's data that have been provided by the TC by the original LTI Launch Request.
 */
router.get('/me',
  ltiSessionValidator,
  (req, res) => {
    const me = req.session.lti.user;
    // Checks if the current user has the `Instructor` LTI Roles and add this to the returned object.
    me.isInstructor = ltiUserService.isInstructor(req.session.lti);
    res.json(me);
  }
);

module.exports = router;
