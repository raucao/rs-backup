#!/usr/bin/env node

import fs, { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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

let publicDir = null;
if (category !== '') {
  publicDir = `public/${initialDir}`;
}

const handleError = function(error) {
  console.log(pc.red(error.message ?? String(error)));
  process.exit(1);
};

const authHeaders = function() {
  return {
    'Authorization': `Bearer ${token}`,
    'User-Agent': `RSBackup/${pkg.version}`,
    'Origin': ORIGIN
  };
};

const fetchWithRetry = async function(url, label) {
  let attempt = 0;

  while (true) {
    try {
      return await fetch(url, { headers: authHeaders() });
    } catch (error) {
      if (error.message.match(retryMatch) && attempt < retryCount) {
        attempt += 1;
        console.log(pc.cyan(error.message));
        console.log(pc.cyan(`Retrying ${label}`));
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
      throw error;
    }
  }
};

const fetchRateLimited = rateLimited(fetchWithRetry, rateLimit);

const fetchDocument = async function(path) {
  const res = await fetchRateLimited(storageBaseUrl+encodePath(path), path);

  if ([200, 304].includes(res.status)) {
    await pipeline(
      Readable.fromWeb(res.body),
      fs.createWriteStream(join(backupDir, path))
    );
    console.log('Wrote '+path);
    return true;
  } else {
    console.log(pc.red(`Error response for ${path}: ${res.status}`));
    return false;
  }
};

const fetchDirectoryContents = async function(dir) {
  fs.mkdirSync(join(backupDir, dir), { recursive: true });

  const res = await fetchRateLimited(storageBaseUrl+encodePath(dir), dir);

  if ([200, 304].includes(res.status)) {
    const listing = await res.json();

    fs.writeFileSync(
      join(backupDir, dir, '000_folder-description.json'),
      JSON.stringify(listing, null, 2) + '\n'
    );

    await Promise.all(Object.keys(listing.items).map((key) => {
      if (isDirectory(key)) {
        return fetchDirectoryContents(dir+key);
      } else {
        return fetchDocument(dir+key);
      }
    }));
  } else if ([401, 403].includes(res.status)) {
    throw new Error('App authorization token invalid or missing');
  } else {
    throw new Error(`Error response for ${dir}: ${res.status}`);
  }
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

const executeBackup = async function() {
  console.log('Starting backup...\n');
  fs.rmSync(backupDir, { recursive: true, force: true });
  fs.mkdirSync(backupDir, { recursive: true });
  await fetchDirectoryContents(initialDir);
  if (includePublic && publicDir) {
    await fetchDirectoryContents(publicDir);
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
    await executeBackup();
    return;
  }

  console.log(pc.cyan('No user address and/or auth token set via options. A browser window will open to connect your account.'));

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
    await executeBackup();
  } finally {
    rl.close();
  }
};

run().catch(handleError);
