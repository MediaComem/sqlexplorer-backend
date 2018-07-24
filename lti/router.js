const express = require('express');
const expressSession = require('express-session');

const config = require('../config');
const { ltiRequestValidator, ltiSessionValidator, ltiXAssignmentValidator } = require('./route-validators');
const LtiContentItemLink = require('./models/lti-content-item-link.class');
const ResponseFormData = require('./models/response-form-data.class');
const assignmentService = require('../lti/services/assignments');
const ltiUserService = require('./services/lti-user');
const responseService = require('./services/responses');
const { LtiSessionError } = require('./utils/custom-errors');

const router = express.Router();

router.use(expressSession(config.session));
router.use(express.urlencoded());
router.use(express.json());

router.post('/select',
  ltiRequestValidator,
  async (req, res) => {
    res.render('item-selection', { assignments: await assignmentService.getAssignments(), selectedUrl: `${config.app.rootUrl}/lti/selected` });
  }
);

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

router.get('/assignment/:id',
  ltiSessionValidator,
  ltiXAssignmentValidator,
  assignmentService.getAssignmentWithQuestionList,
  // assignmentService.getAssignmentState,
  (req, res) => {
    res.json(res.assignmentData);
  }
);

router.post('/assignment/:id/question/:qId/response',
  ltiSessionValidator,
  ltiXAssignmentValidator,
  async (req, res, next) => {
    // User id is retrieve from the session
    const userId = req.session.lti.user.id;
    if (!userId) next(new LtiSessionError('Unable to retrieve your identity from the session data.'));
    // Body must contain : value, isCorrect, position
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
      if (req.body.userScore) await ltiUserService.updateScore(req.body.userScore, req.session.lti);
      const questionStateId = await responseService.upsertQuestionState(responseData);
      const response = await responseService.addToQuestionState(questionStateId, responseData);
      res.json({ saved: true, history: response });
    } catch (err) {
      console.log(err);
      res.status(500).json({ saved: false, error: err });
    }
  }
);

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

router.get('/me',
  ltiSessionValidator,
  (req, res) => {
    res.json(req.session.lti.user);
  }
);

module.exports = router;
