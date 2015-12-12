#!/usr/bin/env node

'use strict';

const fs       = require('fs');
const path     = require('path');
const pkg      = require(path.join(__dirname, 'package.json'));
const program  = require('commander');
const fetch    = require('node-fetch');
const mkdirp   = require('mkdirp');
const rimraf   = require('rimraf');
const prettyJs = require('pretty-js');

program
  .version(pkg.version)
  // .option('--user-address <user address>', 'user address')
  .option('-o, --backup-dir <url>', 'backup directory path')
  .option('-i, --base-url <url>', 'storage base URL of user')
  .option('--token <token>', 'valid bearer token')
  .option('--category <category>', 'category (base directory) to back up')
  .parse(process.argv);

const backupDir = program.backupDir;
const storageBaseUrl = program.baseUrl; // TODO Discovery
const token = program.token;
const category = program.category || '';

if (!(token && storageBaseUrl && backupDir)) {
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

rimraf.sync(backupDir); // TODO incremental update
mkdirp.sync(backupDir);
fetchDirectoryContents(initialDir);
