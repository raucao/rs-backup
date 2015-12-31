#!/usr/bin/env node

'use strict';

const fs        = require('fs');
const path      = require('path');
const pkg       = require(path.join(__dirname, 'package.json'));
const program   = require('commander');
const fetch     = require('node-fetch');
const prompt    = require('prompt');
const opener    = require("opener");
const discovery = require('./discovery.js');
const addQueryParamsToURL = require('./add-query-params-to-url');

program
  .version(pkg.version)
  .option('-i, --backup-dir <url>', 'backup directory path')
  .option('-c, --category <category>', 'category (base directory) to back up')
  .option('-u, --user-address <user address>', 'user address (user@host)')
  .option('-t, --token <token>', 'valid bearer token')
  .parse(process.argv);

const backupDir    = program.backupDir;
const category     = program.category || '';
const authScope    = category.length > 0 ? category+':rw' : '*:rw';
var userAddress    = program.userAddress;
var token          = program.token;
var storageBaseUrl = null;

if (!(backupDir)) {
  // TODO aks or use default
  console.log('Please provide a backup directory path via the --backup-dir option');
  process.exit(1);
}

let isDirectory = function(str) {
  return str[str.length-1] === '/';
};

let initialDir = isDirectory(category) || category === '' ? category : category+'/';

var putDocument = function(path, meta) {
  let headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': meta['Content-Type'],
    'If-None-Match': '"'+meta['ETag']+'"',
    'User-Agent': "RSBackup/1.0"
  };
  let body = fs.createReadStream(backupDir+'/'+path);
  let options = { method: 'PUT', body: body, headers: headers };

  return fetch(storageBaseUrl+encodeURI(path), options)
    .then(res => {
      if (res.status === 200 || res.status === 201) {
        console.log(`Restored ${path} (${String(res.status)})`);
      } else {
        res.text().then(text => console.log(text));
        console.log(`Didn't restore ${path} (${String(res.status)})`);
      }
      return true;
    }, error => handleError(error));
};

var putDirectoryContents = function(dir) {
  let listing = JSON.parse(fs.readFileSync(backupDir+'/'+dir+'000_folder-description.json'));

  Object.keys(listing.items).forEach(key => {
    if (isDirectory(key)) {
      putDirectoryContents(dir+key);
    } else {
      let meta = listing.items[key];
      putDocument(dir+key, meta);
    }
  });
};

var handleError = function(error) {
  console.log(error);
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

var executeRestore = function() {
  console.log('\nStarting restore...\n');
  putDirectoryContents(initialDir);
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
  lookupStorageInfo().then(executeRestore);
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
        executeRestore();
      });
    });
  });
}
