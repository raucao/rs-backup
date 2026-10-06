# AGENTS.md

## Project
`rs-backup` — CLI to back up/restore a [remoteStorage](https://remotestorage.io) account
to/from local disk. Two binaries:
- `rs-backup` → `backup.js` (remote → local)
- `rs-restore` → `restore.js` (local → remote)

## Stack & runtime
- Pure ESM (`"type": "module"`), Node >= 20.16, modern JS (`async/await`, top-level flow).
- Node built-ins only for I/O and networking: `node:fs`, global `fetch`, `node:readline/promises`,
  `node:stream` — do not reintroduce `node-fetch`, `graceful-fs`, `mkdirp`, `rimraf`, or `lodash.*`.
- Runtime deps: `commander`, `webfinger.js` (v3), `picocolors`, `open`.
- Tests use the built-in `node:test` runner (`npm test`).

## File map
- `backup.js` / `restore.js` — CLI entry points: option parsing, recursive walk, prompts, OAuth.
- `discovery.js` — WebFinger lookup; maps a user address to storage `href` + `authURL`.
- `rate-limited.js` — serializes async calls with a fixed delay; returns a promise per call.
- `encode-path.js`, `add-query-params-to-url.js` — small helpers.
- `test/` — `node:test` unit + integration tests.
- `docs/` — user guides.

## Commands
- Run locally: `node backup.js -o ./backup -u user@host -t TOKEN`
- Help: `node backup.js --help` / `node restore.js --help`
- Install globally for manual testing: `npm link`
- Test: `npm test`

## Conventions
- No comments unless necessary; 2-space indent; aligned `=` blocks are common — match surrounding style.
- Keep modules small and single-purpose; prefer Node built-ins over new dependencies.
- Never commit tokens, `.npmrc`, or `node_modules`.

## Domain knowledge (critical)
- Remote folder listings are JSON fetched from storage. Locally persisted as
  `<dir>/000_folder-description.json`; its `items` map drives restore.
- Directory keys always end with `/` (`isDirectory()` checks the trailing slash).
- Backup empties `backupDir` first (`rm -rf`); there is no incremental update yet.
- Path encoding must preserve `/` (see `encode-path.js`).
- Auth uses the OAuth implicit flow. `ORIGIN` (`https://rs-backup.5apps.com`) must match the
  registered client and is sent as the `Origin` header.
- remoteStorage WebFinger rels: `remotestorage`, `remoteStorage`,
  `http://tools.ietf.org/id/draft-dejong-remotestorage` (webfinger.js v3 normalizes all to
  `idx.links.remotestorage`).
- Auth endpoint property keys: `http://tools.ietf.org/html/rfc6749#section-4.2` or `auth-endpoint`.
- Spec version: `http://remotestorage.io/spec/version` or the link `type`.

## webfinger.js v3 gotchas
- Promise API: `await new WebFinger(cfg).lookup(addr)`. It **throws** `WebFingerError` (no callback).
- `response.idx.links.remotestorage` is an array; `link.properties` may be `undefined`.
- Defaults are security-first (`tls_only: true`, `allow_private_addresses: false`). rs-backup sets
  `allow_private_addresses: true` and `tls_only: false` so self-hosted / LAN / localhost storage
  keeps working. The host in the user address must include a non-default port (e.g.
  `user@localhost:8080`) when testing against a local server.
- WebFinger builds `http(s)://<host>/.well-known/webfinger?resource=acct:<address>`; it does not
  take a port separately.

## Gotchas
- Global `fetch` returns a web `ReadableStream`; pipe it with `Readable.fromWeb(res.body)` before
  `pipeline(...)`.
- Use `pkg.version` for the `User-Agent` (`program._version` is commander internals and is not used).
- Rate limiting must wrap only the network request, never the recursive directory walk, or the
  shared queue deadlocks while a parent waits on its children.
