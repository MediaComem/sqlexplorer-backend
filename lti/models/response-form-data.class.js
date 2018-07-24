const isUrl = require('is-url');
const { URL } = require('url');
const oauthSign = require('oauth-sign');

const LtiContentItemLink = require('./lti-content-item-link.class');

/**
 * Represents the data that should be injected in the response form to an LTI ContentItemSeletion request.
 * An instance of ResponseFormData possesses two properties:
 * * `returnUrl`
 * * `params`
 */
class ResponseFormData {

  /**
   * Creates a new ResponseFormeData.
   * @param {String} returnUrl An URL provided by the LTI Tool Consumer in its initial request, with the `content_item_return_url` parameter.
   * @param {Object} consumer An object representing the LTI Tool Consumer.
   * @param {LtiContentItemLink} contentItem An LtiContentItemLink representing the item selected by the user.
   * @throws {TypeError} When any parameter is not of the correct type.
   */
  constructor(returnUrl, consumer, contentItem) {
    if (!(contentItem instanceof LtiContentItemLink)) {
      throw new TypeError(`The 'contentItem' parameter must be an instance of LtiContentItemLink ; ${contentItem.constructor.name} instance given.`)
    }
    if (!Boolean(consumer.key) || !Boolean(consumer.secret)) {
      throw new TypeError("The 'consumer' parameter must be an object with 'key' and 'secret' propoerties.");
    }
    if (!isUrl(returnUrl)) {
      throw new TypeError("The 'returnUrl' paramater must be a valid URL string.");
    }
    this.returnUrl = returnUrl;
    this.params = {
      content_items: contentItem.toJson(),
      lti_message_type: 'ContentItemSelection',
      lti_version: 'LTI-1p0',
    };
  }

  /**
   * Adds OAuth necessary values to the ResponseFormData's `params` property, and creates the OAuth signatures.
   * This signature is calculated using the `params` value, plus all query parameters from the `returnUrl` value.
   * Is is then signed with the `consumer.secret` value.
   * @param {Object} consumer An object representing the LTI Tool Consumer.
   * @param {String} consumer.key The LTI Tool Consumer key.
   * @param {String} consumer.secret The LTI Tool Consumer secret. Will be used to sign the response data.Object
   * @returns {ResponseFormData} Returns the signed instance of ResponseFormData.
   */
  signedWith(consumer) {
    this.params = Object.assign(this.params, {
      oauth_callback: 'about:blank',
      oauth_consumer_key: consumer.key,
      oauth_nonce: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.round(Date.now() / 1000),
      oauth_version: '1.0'
    })
    const url = new URL(this.returnUrl);
    const searchParams = {};
    url.searchParams.forEach((value, name) => searchParams[name] = value);
    this.params.oauth_signature = oauthSign.sign(this.params.oauth_signature_method, 'POST', url.origin + url.pathname, Object.assign(searchParams, this.params), consumer.secret);
    return this;
  }
}

module.exports = ResponseFormData;
