#!/usr/bin/env node

import fs, { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { program } from 'commander';
import open from 'open';
import pc from 'picocolors';

import encodePath from './encode-path.js';
import discovery from './discovery.js';
import rateLimited from './rate-limited.js';
import addQueryParamsToURL from './add-query-params-to-url.js';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

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

let userAddress    = options.userAddress;
let token          = options.token;
let storageBaseUrl = null;

if (!backupDir) {
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

const handleError = function(error) {
  console.log(pc.red(`Error: ${error.message ?? String(error)}`));
};

const authHeaders = function(meta) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': meta['Content-Type'],
    'If-None-Match': '"'+meta['ETag']+'"',
    'User-Agent': `RSBackup/${pkg.version}`,
    'Origin': ORIGIN
  };
};

const putDocument = async function(path, meta) {
  let body;
  try {
    body = fs.readFileSync(join(backupDir, path));
  } catch (e) {
    handleError(`could not restore ${path} (${e.message})`);
    return;
  }

  try {
    const res = await fetchRateLimited(storageBaseUrl+encodePath(path), {
      method: 'PUT',
      body: body,
      headers: authHeaders(meta)
    });

    if (res.status === 200 || res.status === 201) {
      console.log(`Restored ${path} (${String(res.status)})`);
    } else {
      const text = await res.text();
      console.log(text);
      handleError(`didn't restore ${path} (${String(res.status)})`);
    }
  } catch (e) {
    handleError(`could not restore ${path} (${e.message})`);
  }
};

const fetchRateLimited = rateLimited(fetch, rateLimit);

const putDirectoryContents = async function(dir) {
  let listing = null;
  try {
    listing = JSON.parse(fs.readFileSync(join(backupDir, dir, '000_folder-description.json')));
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log(`No description file found for folder '${dir}'. Skipping.`);
    } else {
      console.log('Error:', e.message);
      console.log(`Errored trying to access folder description for '${dir}'. Skipping.`);
    }
  }
  if (!listing) return;

  await Promise.all(Object.keys(listing.items).map((key) => {
    if (isDirectory(key)) {
      return putDirectoryContents(dir+key);
    } else {
      return putDocument(dir+key, listing.items[key]);
    }
  }));
};

const lookupStorageInfo = async function() {
  try {
    const storageInfo = await discovery.lookup(userAddress);
    let href = storageInfo.href;
    if (href[href.length-1] !== '/') { href = href+'/'; }
    storageBaseUrl = href;
    return storageInfo;
  } catch (error) {
    console.log('Lookup of '+userAddress+' failed:');
    console.log(error);
    process.exit(1);
  }
};

const executeRestore = async function() {
  console.log('\nStarting restore...\n');
  await putDirectoryContents(initialDir);
  if (includePublic && publicDir) {
    await putDirectoryContents(publicDir);
  }
};

const promptUserAddress = async function(rl) {
  while (true) {
    const answer = (await rl.question('User address (user@host): ')).trim();
    if (/^.+@.+$/.test(answer)) {
      return answer;
    }
    console.log('Please provide a valid user address. Example: tony@5apps.com');
  }
};

// Start the show

const run = async function() {
  if (token && userAddress) {
    await lookupStorageInfo();
    await executeRestore();
    return;
  }

  console.log(pc.cyan('No user address and auth token set via options. Please type your user address and hit enter in order to open a browser window and connect your remote storage.'));

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    userAddress = await promptUserAddress(rl);

    const storageInfo = await lookupStorageInfo();
    const authURL = addQueryParamsToURL(storageInfo.authURL, {
      client_id: 'rs-backup.5apps.com',
      redirect_uri: ORIGIN + '/',
      response_type: 'token',
      scope: authScope
    });

    await open(authURL);

    token = (await rl.question('Authorization token: ')).trim();
    await executeRestore();
  } finally {
    rl.close();
  }
};

run().catch(handleError);
