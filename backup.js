#!/usr/bin/env node

'use strict';

const fs        = require('fs');
const path      = require('path');
const pkg       = require(path.join(__dirname, 'package.json'));
const program   = require('commander');
const fetch     = require('node-fetch');
const mkdirp    = require('mkdirp');
const rimraf    = require('rimraf');
const prettyJs  = require('pretty-js');
const discovery = require('./discovery.js');

program
  .version(pkg.version)
  .option('-u, --user-address <user address>', 'user address (user@host)')
  .option('-o, --backup-dir <url>', 'backup directory path')
  .option('--token <token>', 'valid bearer token')
  .option('--category <category>', 'category (base directory) to back up')
  .parse(process.argv);

const userAddress  = program.userAddress;
const backupDir    = program.backupDir;
const token        = program.token;
const category     = program.category || '';
var storageBaseUrl = null;

if (!(token && userAddress && backupDir)) {
  program.help();
  process.exit(1);
}

let isDirectory = function(str) {
  return str[str.length-1] === '/';
};

let initialDir = isDirectory(category) || category === '' ? category : category+'/';

let options = {
  headers: {
    "Authorization": `Bearer ${token}`,
    "User-Agent": "RSBackup/1.0"
  }
};

var fetchDocument = function(path) {
  return fetch(storageBaseUrl+path, options)
    .then(res => {
      res.body.pipe(fs.createWriteStream(backupDir+'/'+path));
      res.body.on('end', () => {
        console.log('Wrote '+path);
        return true;
      });
    })
    .catch(error => handleError(error));
};

var fetchDirectoryContents = function(dir) {
  mkdirp.sync(backupDir+'/'+dir);
  return fetch(storageBaseUrl+dir, options)
    .then(res => res.json())
    .then(listing => {
      fs.writeFileSync(backupDir+'/'+dir+'000_folder-description.json',
                       prettyJs(JSON.stringify(listing), {quoteProperties: null}));
      Object.keys(listing.items).forEach(key => {
        if (isDirectory(key)) {
          fetchDirectoryContents(dir+key);
        } else {
          fetchDocument(dir+key);
        }
      });
    })
    .catch(error => handleError(error));
};

var handleError = function(error) {
  console.log(error);
  // process.exit(1);
};

var executeBackup = function() {
  rimraf.sync(backupDir); // TODO incremental update
  mkdirp.sync(backupDir);
  fetchDirectoryContents(initialDir);
};

// Start the show

discovery.lookup(userAddress)
  .then(storageInfo => {
    let href = storageInfo.href;
    if (href[href.length-1] !== '/') { href = href+'/'; }
    storageBaseUrl = href;
    executeBackup();
  })
  .catch(error => {
    console.log('Lookup of '+userAddress+' failed:');
    console.log(error);
    process.exit(1);
  });
