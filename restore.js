#!/usr/bin/env node

'use strict';

const fs          = require('fs');
const path        = require('path');
const pkg         = require(path.join(__dirname, 'package.json'));
const { program } = require('commander');
const fetch       = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const prompt      = require('prompt');
const opener      = require("opener");
const colors      = require("colors");

const encodePath  = require('./encode-path');
const discovery   = require('./discovery.js');
const rateLimited = require('./rate-limited');
const addQueryParamsToURL = require('./add-query-params-to-url');

program
  .version(pkg.version)
  .option('-i, --backup-dir <path>', 'backup directory path')
  .option('-u, --user-address <user address>', 'user address (user@host)')
  .option('-t, --token <token>', 'valid bearer token')
  .option('-c, --category <category>', 'category (base directory) to back up')
  .option('-p, --include-public', 'when backing up a single category, include the public folder of that category')
  .option('-r, --rate-limit <time>', 'time interval for network requests in ms (default is 40)');

program.parse(process.argv);
const options = program.opts();

const ORIGIN        = 'https://rs-backup.5apps.com';
const backupDir     = options.backupDir;
const category      = options.category || '';
const includePublic = options.includePublic || false;
const authScope     = category.length > 0 ? category+':rw' : '*:rw';
const rateLimit     = options.rateLimit || 40;

let userAddress     = options.userAddress;
let token           = options.token;
let storageBaseUrl  = null;

if (!(backupDir)) {
  // TODO ask or use default
  console.log('Please provide a backup directory path via the --backup-dir option');
  process.exit(1);
}

const isDirectory = function(str) {
  return str[str.length-1] === '/';
};

const initialDir = isDirectory(category) || category === '' ? category : category+'/';

let publicDir;
if (category !== '') {
  publicDir = `public/${initialDir}`;
}

const handleError = function(msg) {
  console.log(`Error: ${msg}`.red)
}

const putDocument = function(path, meta) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': meta['Content-Type'],
    'If-None-Match': '"'+meta['ETag']+'"',
    'User-Agent': `RSBackup/${program._version}`,
    'Origin': ORIGIN
  };

  let body;
  try {
    body = fs.readFileSync(backupDir+'/'+path);
  } catch(e) {
    handleError(`could not restore ${path} (${e.message})`);
  }

  const options = { method: 'PUT', body: body, headers: headers };

  return fetch(storageBaseUrl+encodePath(path), options).then(res => {
    if (res.status === 200 || res.status === 201) {
      console.log(`Restored ${path} (${String(res.status)})`);
    } else {
      res.text().then(text => console.log(text));
      handleError(`didn't restore ${path} (${String(res.status)})`);
    }
  }, e => {
    handleError(`could not restore ${path} (${e.message})`);
  });
};

const putDocumentRateLimited = rateLimited(putDocument, rateLimit);

const putDirectoryContents = function(dir) {
  let listing = null;
  try {
    listing = JSON.parse(fs.readFileSync(backupDir+'/'+dir+'000_folder-description.json'));
  } catch(e) {
    if (e.code === 'ENOENT') {
      console.log(`No description file found for folder '${dir}'. Skipping.`);
    } else {
      console.log('Error:', e.message);
      console.log(`Errored trying to access folder description for '${dir}'. Skipping.`);
    }
  }
  if (!listing) return;

  Object.keys(listing.items).forEach(key => {
    if (isDirectory(key)) {
      putDirectoryContents(dir+key);
    } else {
      const meta = listing.items[key];
      putDocumentRateLimited(dir+key, meta);
    }
  });
};

const lookupStorageInfo = function() {
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

const executeRestore = function() {
  console.log('\nStarting restore...\n');
  putDirectoryContents(initialDir);
  if (includePublic && publicDir) {
    putDirectoryContents(publicDir);
  }
};

const schemas = {
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
      const authURL = addQueryParamsToURL(storageInfo.authURL, {
        client_id: 'rs-backup.5apps.com',
        redirect_uri: ORIGIN + '/',
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
