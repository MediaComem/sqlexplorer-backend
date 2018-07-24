const imsLti = require('ims-lti');

/* --- Decorate Provider class --- */

const Provider = imsLti.Provider;

Provider.prototype.validRequest = function (req) {
  return new Promise((resolve, reject) => {
    this.valid_request(req, (err, isValid) => {
      err ? reject(err) : resolve(isValid);
    });
  });
}

Provider.prototype._valid_parameters = function (body) {
  if (!body) {
    return false;
  }
  const correct_version = imsLti.supported_versions.indexOf(body.lti_version) !== -1;
  const correctBasicLaunch = body.lti_message_type === 'basic-lti-launch-request' && Boolean(body.resource_link_id);
  const correctContentItemSelection = body.lti_message_type === 'ContentItemSelectionRequest' && Boolean(body.content_item_return_url);
  return correct_version && (correctBasicLaunch || correctContentItemSelection);
}

imsLti.Provider = Provider;

/* --- Decorate OutcomeService class --- */

const OutcomeService = imsLti.OutcomeService;

OutcomeService.prototype.readResult = function () {
  return new Promise((resolve, reject) => {
    this.send_read_result((err, result) => {
      err ? reject(err) : resolve(result);
    });
  });
}

OutcomeService.prototype.replaceResult = function (value) {
  return new Promise((resolve, reject) => {
    this.send_replace_result(value, (err, result) => {
      err ? reject(err) : resolve(result);
    });
  });
}

OutcomeService.prototype.deleteResult = function () {
  return new Promise((resolve, reject) => {
    this.send_delete_result((err, result) => {
      err ? reject(err) : resolve(result);
    });
  });
}

imsLti.OutcomeService = OutcomeService;

module.exports = imsLti;
