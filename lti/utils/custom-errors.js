/**
 * This error should be used whenever a problem with an LTI consumer key occurs.
 */
class LtiConsumerKeyError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * This error should be used whenever a problem with an LTI consumer occurs.
 */
class LtiConsumerError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * This error should be used whenever a problem with an LTI user's session occurs.
 */
class LtiSessionError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

module.exports = {
  LtiConsumerError,
  LtiConsumerKeyError,
  LtiSessionError
};
