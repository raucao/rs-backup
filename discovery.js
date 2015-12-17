#!/usr/bin/env node

'use strict';

const WebFinger = require('webfinger.js');

Promise.defer = function() {
  var resolve, reject;
  var promise = new Promise(function() {
    resolve = arguments[0];
    reject = arguments[1];
  });
  return {
    resolve: resolve,
    reject: reject,
    promise: promise
  };
};

let discovery = {

  lookup(userAddress) {
    let pending = Promise.defer();

    let webfinger = new WebFinger({
      tls_only: false,
      uri_fallback: false,
      request_timeout: 5000
    });

    webfinger.lookup(userAddress, function (err, response) {
      if (err) {
        pending.reject(err.message);
      } else if ((typeof response.idx.links.remotestorage !== 'object') ||
                 (typeof response.idx.links.remotestorage.length !== 'number') ||
                 (response.idx.links.remotestorage.length <= 0)) {
        pending.reject("WebFinger record for " + userAddress + " does not have remotestorage defined in the links section.");
      }
      let rs      = response.idx.links.remotestorage[0];
      let authURL = rs.properties['http://tools.ietf.org/html/rfc6749#section-4.2'] || rs.properties['auth-endpoint'];
      let version = rs.properties['http://remotestorage.io/spec/version'] || rs.type;

      pending.resolve({
        href: rs.href,
        authURL: authURL,
        version: version,
        properties: rs.properties
      });
    });

    return pending.promise;
  }

};

module.exports = discovery;
