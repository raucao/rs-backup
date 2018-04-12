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
const opener      = require("opener");
const colors      = require("colors");
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
  let options = {
    headers: { "Authorization": `Bearer ${token}`, "User-Agent": "RSBackup/1.0" }
  };
  return fetch(storageBaseUrl+path, options)
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
    .catch(error => handleError(error));
};

let fetchDocumentRateLimited = rateLimited(fetchDocument, rateLimit);

var fetchDirectoryContents = function(dir) {
  mkdirp.sync(backupDir+'/'+dir);
  let options = {
    headers: { "Authorization": `Bearer ${token}`, "User-Agent": "RSBackup/1.0" }
  };
  return fetch(storageBaseUrl+dir, options)
    .then(res => res.json())
    .then(listing => {
      if (listing.error) { console.log(listing.error); process.exit(1); }

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
    .catch(error => handleError(error));
};

let fetchDirectoryContentsRateLimited = rateLimited(fetchDirectoryContents, rateLimit);

var handleError = function(error) {
  console.log(error);
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
  console.log('\nStarting backup...\n');
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
    required: true,
  },
  token: {
    name: 'token',
    description: 'Authorization token:',
    type: 'string',
    required: true,
  }
};

// Start the show

if (token && userAddress) {
  lookupStorageInfo().then(executeBackup);
} else {
  console.log('No user address and auth token set via options. Please type your user address and hit enter in order to open a browser window and connect your remote storage.'.cyan);
  prompt.message = '';
  prompt.delimiter = '';
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
