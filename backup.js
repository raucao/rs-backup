#!/usr/bin/env node

'use strict';

const fs          = require('graceful-fs');
const path        = require('path');
const pkg         = require(path.join(__dirname, 'package.json'));
const program     = require('commander');
const fetch       = require('node-fetch');
const mkdirp      = require('mkdirp');
const rimraf      = require('rimraf');
const prettyJs    = require('pretty-js');
const prompt      = require('prompt');
const opener      = require('opener');
const colors      = require('colors');
const encodePath  = require('./encode-path');
const discovery   = require('./discovery');
const rateLimited = require('./rate-limited');
const addQueryParamsToURL = require('./add-query-params-to-url');

program
  .version(pkg.version)
  .option('-o, --backup-dir <path>', 'backup directory path')
  .option('-c, --category <category>', 'category (base directory) to back up')
  .option('-u, --user-address <user address>', 'user address (user@host)')
  .option('-t, --token <token>', 'valid bearer token')
  .option('-r, --rate-limit <time>', 'time interval for network requests in ms (default is 20)')
  .parse(process.argv);

const backupDir    = program.backupDir;
const category     = program.category || '';
const authScope    = category.length > 0 ? category+':rw' : '*:rw';
const rateLimit    = program.rateLimit || 20;
const retryCount   = 3;
const _retryMap = {};
const _retryMatch = /(ETIMEDOUT|socket hang up|Client network socket disconnected before secure TLS connection was established|ENETDOWN|ECONNRESET|ENOTFOUND)/;
const _retryDelay = 1000;
var userAddress    = program.userAddress;
var token          = program.token;
var storageBaseUrl = null;

if (!(backupDir)) {
  // TODO ask or use default
  console.log('Please provide a backup directory path via the --backup-dir option');
  process.exit(1);
}

let isDirectory = function(str) {
  return str[str.length-1] === '/';
};

let initialDir = isDirectory(category) || category === '' ? category : category+'/';

var fetchDocument = function(path) {
  _retryMap[path] = _retryMap[path] || 0;

  let options = {
    headers: { "Authorization": `Bearer ${token}`, "User-Agent": "RSBackup/1.0" }
  };
  return fetch(storageBaseUrl+encodePath(path), options)
    .then(res => {
      if ([200, 304].includes(res.status)) {
        res.body.pipe(fs.createWriteStream(backupDir+'/'+path));
        res.body.on('end', () => {
          console.log('Wrote '+path);
          return true;
        });
      } else {
        console.log(`Error response for ${path}: ${res.status}`.red);
        return false;
      }
    })
    .catch(function (error) {
      if (error.message.match(_retryMatch) && _retryMap[path] < retryCount) {
        console.log(colors.cyan(error.message));
        console.log(colors.cyan(`Retrying ${ path }`));

        _retryMap[path] += 1;

        return new Promise(function (res) {
          setTimeout(function () {
            return res(fetchDocument(path));
          }, _retryDelay);
        });
      }

      return handleError(error);
    });
};

let fetchDocumentRateLimited = rateLimited(fetchDocument, rateLimit);

var fetchDirectoryContents = function(dir) {
  _retryMap[dir] = _retryMap[dir] || 0;

  mkdirp.sync(backupDir+'/'+dir);

  let options = {
    headers: { "Authorization": `Bearer ${token}`, "User-Agent": "RSBackup/1.0" }
  };
  return fetch(storageBaseUrl+encodePath(dir), options)
    .then(res => {
      if ([200, 304].includes(res.status)) {
        return res.json()
      } else if ([401, 403].includes(res.status))  {
        throw(Error('App authorization token invalid or missing'))
      } else {
        handleError(res.error)
      }
    })
    .then(listing => {
      // TODO compare with potentially existing listing and only fetch changed dirs and docs
      fs.writeFileSync(backupDir+'/'+dir+'000_folder-description.json',
                       prettyJs(JSON.stringify(listing), {quoteProperties: null}));

      Object.keys(listing.items).forEach(key => {
        if (isDirectory(key)) {
          fetchDirectoryContentsRateLimited(dir+key);
        } else {
          fetchDocumentRateLimited(dir+key);
        }
      });
    })
    .catch(function (error) {
      if (error.message.match(_retryMatch) && _retryMap[dir] < retryCount) {
        console.log(colors.cyan(error.message));
        console.log(colors.cyan(`Retrying ${ dir }`));

        _retryMap[dir] += 1;

        return new Promise(function (res) {
          setTimeout(function () {
            return res(fetchDocument(dir));
          }, _retryDelay);
        });
      }

      return handleError(error);
    });
};

let fetchDirectoryContentsRateLimited = rateLimited(fetchDirectoryContents, rateLimit);

var handleError = function(error) {
  console.log(colors.red(error.message));
  process.exit(1);
};

var lookupStorageInfo = function() {
  return discovery.lookup(userAddress).then(storageInfo => {
    let href = storageInfo.href;
    if (href[href.length-1] !== '/') { href = href+'/'; }
    storageBaseUrl = href;
    return storageInfo;
  }).catch(error => {
    console.log('Lookup of '+userAddress+' failed:');
    console.log(error);
    process.exit(1);
  });
};

var executeBackup = function() {
  console.log('Starting backup...\n');
  rimraf.sync(backupDir); // TODO incremental update
  mkdirp.sync(backupDir);
  fetchDirectoryContents(initialDir);
};

var schemas = {
  userAddress: {
    name: 'userAddress',
    description: 'User address (user@host):',
    type: 'string',
    pattern: /^.+@.+$/,
    message: 'Please provide a valid user address. Example: tony@5apps.com',
    required: true
  },
  token: {
    name: 'token',
    description: 'Authorization token:',
    type: 'string',
    required: true
  }
};

// Start the show

if (token && userAddress) {
  lookupStorageInfo().then(executeBackup);
} else {
  console.log('No user address and/or auth token set via options. A browser window will open to connect your account.'.cyan);
  prompt.message = '';
  prompt.delimiter = '';
  prompt.override = program;
  prompt.start();

  prompt.get(schemas.userAddress, (err, result) => {
    userAddress = result.userAddress;

    lookupStorageInfo().then(storageInfo => {
      let authURL = addQueryParamsToURL(storageInfo.authURL, {
        client_id: 'rs-backup.5apps.com',
        redirect_uri: 'https://rs-backup.5apps.com/',
        response_type: 'token',
        scope: authScope
      });

      opener(authURL);

      prompt.get(schemas.token, (err, result) => {
        token = result.token;
        executeBackup();
      });
    });
  });
}
