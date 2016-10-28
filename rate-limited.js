#!/usr/bin/env node

'use strict';

const _delay    = require("lodash.delay");
const _bind     = require("lodash.bind");
const _map      = require("lodash.map");

let rateLimited = function(func, rate) {
  let queue = [];
  let timeOutRef = false;
  let currentlyEmptyingQueue = false;

  let emptyQueue = function() {
    if (queue.length) {
      currentlyEmptyingQueue = true;
      _delay(function() {
        queue.shift().call();
        emptyQueue();
      }, rate);
    } else {
      currentlyEmptyingQueue = false;
    }
  };

  return function() {
    let args = _map(arguments, function(e) { return e; }); // get arguments into an array
    queue.push( _bind.apply(this, [func, this].concat(args)) ); // call apply so that we can pass in arguments as parameters as opposed to an array
    if (!currentlyEmptyingQueue) { emptyQueue(); }
  };
};

module.exports = rateLimited;
