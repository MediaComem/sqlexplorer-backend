const OutcomeService = require('ims-lti').OutcomeService;

const knex = require('../../config').knexDb;
const { getRandomUserInfo } = require('../../utils/random-user-info');

async function upsert(req, res, next) {
  const tcUserId = req.session.lti.rawData.user_id;
  const ltiToolConsumerId = req.session.lti.consumer.id;
  // get the user from the request
  try {
    const user = await getFromTC(tcUserId, ltiToolConsumerId);
    let returnedData;
    // Check if existing user with this id
    if (!Boolean(user)) {
      // If not existing : creates with values from request or default values
      const randomUserInfo = getRandomUserInfo();
      const userData = {
        tc_user_id: tcUserId,
        image: req.session.lti.rawData.image || null,
        firstname: req.session.lti.rawData.lis_person_name_given || randomUserInfo.given,
        lastname: req.session.lti.rawData.lis_person_name_family || randomUserInfo.family,
        last_access: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        lti_tc_id: ltiToolConsumerId
      }
      req.session.lti.user = await create(userData);
    } else {
      // If existing : update with new value from request (lti_person_name_given, lti_person_name_family)
      const userData = {
        last_access: new Date()
      }
      if (user.firstname !== req.session.lti.rawData.lis_person_name_given) {
        userData.firstname = req.session.lti.rawData.lis_person_name_given;
      }
      if (user.lastname !== req.session.lti.rawData.lis_person_name_family) {
        userData.lastname = req.session.lti.rawData.lis_person_name_family;
      }
      if (user.image !== req.session.lti.rawData.image) {
        userData.image = req.session.lti.rawData.image;
      }
      req.session.lti.user = await update(user.id, userData);
    }
    next();
  } catch (err) {
    next(err);
  }
}

function get(id) {
  return knex('lti_user').first().where('id', id);
}

function getFromTC(tcUserId, ltiToolConsumerId) {
  return knex('lti_user').first().where({
    tc_user_id: tcUserId,
    lti_tc_id: ltiToolConsumerId
  });
}

function create(userData) {
  return knex('lti_user').insert(userData).returning('*')
    .then(result => result[0]);
}

function update(id, userData) {
  return knex('lti_user').where('id', id).update(userData).returning('*')
    .then(result => result[0]);
}

async function updateScore(score, ltiSession) {
  const outcomeService = new OutcomeService({
    consumer_key: ltiSession.consumer.key,
    consumer_secret: ltiSession.consumer.secret,
    service_url: ltiSession.rawData.lis_outcome_service_url,
    source_did: ltiSession.rawData.lis_result_sourcedid
  });
  await outcomeService.replaceResult(score);
}

module.exports = { upsert, get, getFromTC, updateScore };
