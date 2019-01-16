const { get } = require('lodash');
const redisClient = require('redis').createClient();

const config = require('../config');
const lti = require('./utils/ims-lti-mutator');
const { LtiConsumerKeyError, LtiSessionError } = require('./utils/custom-errors');
const { isInstructor } = require('./services/lti-user');

const redisNonceStore = new lti.Stores.RedisStore(redisClient);

/**
 * Middleware function that checks if the request is a valid LTI request.
 * This is done by:
 * * Checking is the body contains an `oauth_consumer_key`
 * * Checking it the consumer key is valid
 * * Checking the request validity with a new Provider
 * If the consumerKey can not be found or is not valid, the `next` callback is called with a new LtiConsumerKeyError.
 * If the Provider invalidate the request, the `next` callback is called with a new Error.
 * @param {Request} req The express request.
 * @param {Response} res The express response.
 * @param {Function} next The next expression callback.
 */
async function ltiRequestValidator(req, res, next) {
  const consumerKey = get(req, 'body.oauth_consumer_key', undefined);
  if (!Boolean(consumerKey)) {
    return next(new LtiConsumerKeyError('LTI request is missing a consumer key value.'));
  }
  const consumer = await config.knexDb.first().from('lti_consumers').where('key', consumerKey);
  if (!Boolean(consumer)) {
    return next(new LtiConsumerKeyError(`The given LTI consumer key '${consumerKey}' is not an active key. Please try again with a valid consumer key or request a new one.`));
  }
  if (req.body.lti_message_type === 'basic-lti-launch-request' && !Boolean(req.body.user_id)) {
    return next(new Error("LTI request is missing a 'user_id' value. Please try changing the settings of your LMS so that it provides this information when launching this tool."));
  }
  const provider = new lti.Provider(consumer.key, consumer.secret, redisNonceStore);
  try {
    await provider.validRequest(req);
    req.session.lti = {
      rawData: req.body,
      consumer: consumer
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Middleware that checks if the user making the request has a session with an `lti` object, which should have at least two properties : `rawData` and `consumer`.
 * If this object is not found or does not contains the correct data, then the `next` callback is called with a new LtiSessionError.
 * @param {Request} req The express request.
 * @param {Response} res The express response.
 * @param {Function} next The next express function.
 */
function ltiSessionValidator(req, res, next) {
  if (!Boolean(req.session.lti)) {
    next(new LtiSessionError('Unable to find your session data.'));
  } else {
    next();
  }
}

/**
 * Middleware that checks if the user has the LTI "Instructor" role.
 * If not, the `next` callback is called with an Error.
 * @param {Request} req The express request.
 * @param {Response} res The express response.
 * @param {Function} next The next express function.
 */
function ltiInstructorValidator(req, res, next) {
  if (!isInstructor(req.session.lti)) {
    next(new Error('You are not authorized to do this action.'));
  } else {
    next();
  }
}

/**
 * Middleware that checks if the user tries to access an assignment to which he has not been given access.
 * This is done by comparing the `id` route param value to the `custom_assignment_id` session value.
 * @param {Request} req The express request.
 * @param {Response} res The express response.
 * @param {Function} next The next express function.
 */
function ltiXAssignmentValidator(req, res, next) {
  if (req.session.lti.rawData.custom_assignment_id !== req.params.id) {
    next(new LtiSessionError('You are not allowed to access this assignment from this LTI session.'));
  } else {
    next();
  }
}

function ltiAvailabilityValidator(req, res, next) {
  const today = new Date();
  const startDate = req.session.lti.rawData.custom_start_date ? new Date(req.session.lti.rawData.custom_start_date) : undefined;
  const endDate = req.session.lti.rawData.custom_end_date ? new Date(req.session.lti.rawData.custom_end_date) : undefined;
  if (startDate && startDate > today) {
    next(new Error('This assignment will not be available before '))
  }
}

module.exports = {
  ltiRequestValidator,
  ltiSessionValidator,
  ltiXAssignmentValidator,
  ltiInstructorValidator
};
