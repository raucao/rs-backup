#!/usr/bin/env node

'use strict';

const fs       = require('fs');
const path     = require('path');
const pkg      = require(path.join(__dirname, 'package.json'));
const program  = require('commander');
const fetch    = require('node-fetch');

program
  .version(pkg.version)
  // .option('--user-address <user address>', 'user address')
  .option('-i, --backup-dir <url>', 'backup directory path')
  .option('-o, --base-url <url>', 'storage base URL of user')
  .option('--token <token>', 'valid bearer token')
  .option('--category <category>', 'category (base directory) to restore')
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

var putDocument = function(path, meta) {
  let headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': meta['Content-Type'],
    'If-None-Match': '"'+meta['ETag']+'"',
    'User-Agent': "RSBackup/1.0"
  };
  let body = fs.createReadStream(backupDir+'/'+path);
  let options = { method: 'PUT', body: body, headers: headers };

  return fetch(storageBaseUrl+path, options)
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

putDirectoryContents(initialDir);
