import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function startMockServer() {
  const received = [];
  const requests = [];
  const server = createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const port = server.address().port;

    requests.push({ method: req.method, pathname });

    if (req.method === 'PUT') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        received.push({ pathname, body, headers: req.headers });
        res.statusCode = 200;
        res.end('ok');
      });
      return;
    }

    if (pathname === '/.well-known/webfinger') {
      res.setHeader('content-type', 'application/jrd+json');
      res.end(JSON.stringify({
        subject: 'acct:user@localhost',
        links: [{
          rel: 'remotestorage',
          href: `http://localhost:${port}/storage/`,
          properties: {
            'http://tools.ietf.org/html/rfc6749#section-4.2': `http://localhost:${port}/oauth`
          }
        }],
        properties: {}
      }));
      return;
    }

    const decodedPath = decodeURIComponent(pathname);

    const listings = {
      '/storage/': { items: { 'foo.txt': { ETag: 'a' }, 'sub/': { ETag: 'b' }, '#foo/': { ETag: 'd' } } },
      '/storage/sub/': { items: { 'bar.txt': { ETag: 'c' } } },
      '/storage/#foo/': { items: { 'inside.txt': { ETag: 'e' } } }
    };

    if (listings[decodedPath]) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(listings[decodedPath]));
      return;
    }

    const documents = {
      '/storage/foo.txt': 'hello',
      '/storage/sub/bar.txt': 'world',
      '/storage/#foo/inside.txt': 'hashed'
    };

    if (documents[decodedPath]) {
      res.setHeader('content-type', 'text/plain');
      res.end(documents[decodedPath]);
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });

  server.received = received;
  server.requests = requests;

  return new Promise((resolve) => {
    server.listen(0, () => resolve(server));
  });
}

function runCli(script, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(projectRoot, script), ...args], {
      cwd: projectRoot
    });

    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => resolve({ code, output }));
  });
}

test('rs-backup downloads a remoteStorage tree end to end', async (t) => {
  const server = await startMockServer();
  const port = server.address().port;
  const backupDir = await mkdtemp(join(tmpdir(), 'rs-backup-test-'));

  t.after(async () => {
    server.close();
    await rm(backupDir, { recursive: true, force: true });
  });

  const { code, output } = await runCli('backup.js', [
    '-o', backupDir,
    '-u', `user@localhost:${port}`,
    '-t', 'test-token',
    '-r', '1'
  ]);

  assert.equal(code, 0, output);
  assert.equal(await readFile(join(backupDir, 'foo.txt'), 'utf8'), 'hello');
  assert.equal(await readFile(join(backupDir, 'sub', 'bar.txt'), 'utf8'), 'world');
  assert.ok(JSON.parse(await readFile(join(backupDir, '000_folder-description.json'), 'utf8')).items['foo.txt']);
  assert.ok(JSON.parse(await readFile(join(backupDir, 'sub', '000_folder-description.json'), 'utf8')).items['bar.txt']);

  assert.equal(await readFile(join(backupDir, '#foo', 'inside.txt'), 'utf8'), 'hashed');
  assert.ok(JSON.parse(await readFile(join(backupDir, '#foo', '000_folder-description.json'), 'utf8')).items['inside.txt']);

  assert.ok(
    server.requests.some((r) => r.pathname === '/storage/%23foo/'),
    'expected the hash directory to be requested with an encoded path'
  );
});

test('rs-restore uploads a local backup end to end', async (t) => {
  const server = await startMockServer();
  const port = server.address().port;
  const backupDir = await mkdtemp(join(tmpdir(), 'rs-restore-test-'));

  t.after(async () => {
    server.close();
    await rm(backupDir, { recursive: true, force: true });
  });

  await mkdir(join(backupDir, 'sub'), { recursive: true });
  await mkdir(join(backupDir, '#foo'), { recursive: true });
  await writeFile(join(backupDir, 'foo.txt'), 'hello');
  await writeFile(join(backupDir, 'sub', 'bar.txt'), 'world');
  await writeFile(join(backupDir, '#foo', 'inside.txt'), 'hashed');
  await writeFile(join(backupDir, '000_folder-description.json'), JSON.stringify({
    items: {
      'foo.txt': { ETag: 'a', 'Content-Type': 'text/plain' },
      'sub/': { ETag: 'b' },
      '#foo/': { ETag: 'd' }
    }
  }));
  await writeFile(join(backupDir, 'sub', '000_folder-description.json'), JSON.stringify({
    items: { 'bar.txt': { ETag: 'c', 'Content-Type': 'text/plain' } }
  }));
  await writeFile(join(backupDir, '#foo', '000_folder-description.json'), JSON.stringify({
    items: { 'inside.txt': { ETag: 'e', 'Content-Type': 'text/plain' } }
  }));

  const { code, output } = await runCli('restore.js', [
    '-i', backupDir,
    '-u', `user@localhost:${port}`,
    '-t', 'test-token',
    '-r', '1'
  ]);

  assert.equal(code, 0, output);

  const uploaded = Object.fromEntries(server.received.map((r) => [r.pathname, r.body]));
  assert.equal(uploaded['/storage/foo.txt'], 'hello');
  assert.equal(uploaded['/storage/sub/bar.txt'], 'world');
  assert.equal(uploaded['/storage/%23foo/inside.txt'], 'hashed');
});
