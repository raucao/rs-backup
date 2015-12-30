#!/usr/bin/env node

'use strict';

module.exports = function(url, params) {
  url += url.match(/\?\w+\=/) ? '&' : '?';

  Object.keys(params).forEach((key, i) => {
    url += key+'='+params[key];
    if (i !== Object.keys(params).length-1) { url += '&'; }
  });

  return url;
};
