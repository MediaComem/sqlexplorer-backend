const config = require('../../config');

/**
 * Represents an LTI Content Item.
 * These objects should be used when constructing a ContentItemSelectionRequest response.
 * An instance of LtiContentImte only possesses three properties:
 * * `title`
 * * `text`
 * * `custom`
 * Use the `toJson()` method of an LTI Content Item to generate a correct and complete JSON representation of an instance, according to the LTI specification.
 */
class LtiContentItemLink {

  /**
   * Creates a new LtiContentItem.
   * @param {String} title The title of the Content Item
   * @param {String} [text=''] A description of the Content Item. Defaults to empty string.
   * @param {Object} [customValues={}] An object of custom values that will be added to the custom property of the Content Item. Default to empty object.
   * @throws {TypeError} When any parameter is not of the correct type.
   */
  constructor(title, text = '', customValues = {}) {
    if (typeof title !== 'string') {
      throw new TypeError(`The 'title' parameter must be of type string ; '${typeof title}' given.`);
    }
    if (typeof title !== 'string') {
      throw new TypeError(`The 'text' parameter must be of type 'string' ; '${typeof text}' given.`);
    }
    if (typeof customValues !== 'object') {
      throw new TypeError(`The 'customValues' parameter must be of type 'object' ; '${typeof object}' given.`);
    }
    this.title = title;
    this.text = text;
    this.custom = customValues;
  }

  /**
   * Converts an LtiItem object to its valid JSON representation, as described in the [LTI specification]{@link https://www.imsglobal.org/specs/lticiv1p0/specification-3}.
   * @returns {String} The JSON representation of this LtiItem.
   */
  toJson() {
    return JSON.stringify({
      "@context": "http://purl.imsglobal.org/ctx/lti/v1/ContentItem",
      "@graph": [{
        "@type": "LtiLinkItem",
        mediaType: "application/vnd.ims.lti.v1.ltilink",
        title: this.title,
        text: this.text,
        custom: this.custom,
        url: `${config.app.rootUrl}/lti/launch`
      }]
    });
  }
};

module.exports = LtiContentItemLink;
