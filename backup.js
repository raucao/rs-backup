#!/usr/bin/env node

'use strict';

const fs          = require('graceful-fs');
const path        = require('path');
const pkg         = require(path.join(__dirname, 'package.json'));
const { program } = require('commander');
const fetch       = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
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
  .option('-u, --user-address <user address>', 'user address (user@host)')
  .option('-t, --token <token>', 'valid bearer token')
  .option('-c, --category <category>', 'category (base directory) to back up')
  .option('-p, --include-public', 'when backing up a single category, include the public folder of that category')
  .option('-r, --rate-limit <time>', 'time interval for network requests in ms (default is 20)');

program.parse(process.argv);
const options = program.opts();

const ORIGIN        = 'https://rs-backup.5apps.com';
const backupDir     = options.backupDir;
const category      = options.category || '';
const includePublic = options.includePublic || false;
const authScope     = category.length > 0 ? category+':rw' : '*:rw';
const rateLimit     = options.rateLimit || 20;
const retryCount    = 3;
const retryDelay    = 1000;
const retryMatch    = /(ETIMEDOUT|socket hang up|Client network socket disconnected before secure TLS connection was established|ENETDOWN|ECONNRESET|ENOTFOUND)/;
const _retryMap     = {};

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

let publicDir = null;
if (category !== '') {
  publicDir = `public/${initialDir}`;
}

const handleError = function(error) {
  console.log(colors.red(error.message));
  process.exit(1);
};

const fetchDocument = function(path) {
  _retryMap[path] = _retryMap[path] || 0;

  const options = {
    headers: { "Authorization": `Bearer ${token}`, "User-Agent": `RSBackup/${program._version}`, "Origin": ORIGIN }
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
      if (error.message.match(retryMatch) && (_retryMap[path] < retryCount)) {
        console.log(colors.cyan(error.message));
        console.log(colors.cyan(`Retrying ${ path }`));

        _retryMap[path] += 1;

        return new Promise(function (res) {
          setTimeout(function () {
            return res(fetchDocument(path));
          }, retryDelay);
        });
      }

      return handleError(error);
    });
};

const fetchDocumentRateLimited = rateLimited(fetchDocument, rateLimit);

const fetchDirectoryContents = function(dir) {
  _retryMap[dir] = _retryMap[dir] || 0;

  mkdirp.sync(backupDir+'/'+dir);

  const options = {
    headers: { "Authorization": `Bearer ${token}`, "User-Agent": `RSBackup/${program._version}`, "Origin": ORIGIN }
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
      if (error.message.match(retryMatch) && (_retryMap[dir] < retryCount)) {
        console.log(colors.cyan(error.message));
        console.log(colors.cyan(`Retrying ${ dir }`));

        _retryMap[dir] += 1;

        return new Promise(function (res) {
          setTimeout(function () {
            return res(fetchDocument(dir));
          }, retryDelay);
        });
      }

      return handleError(error);
    });
};

const fetchDirectoryContentsRateLimited = rateLimited(fetchDirectoryContents, rateLimit);

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

const executeBackup = function() {
  console.log('Starting backup...\n');
  rimraf.sync(backupDir); // TODO incremental update
  mkdirp.sync(backupDir);
  fetchDirectoryContents(initialDir);
  if (includePublic && publicDir) {
    fetchDirectoryContents(publicDir);
  }
};

const schemas = {
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
      const authURL = addQueryParamsToURL(storageInfo.authURL, {
        client_id: 'rs-backup.5apps.com',
        redirect_uri: ORIGIN + '/',
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
