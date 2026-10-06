import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import discovery from '../discovery.js';

const originalFetch = globalThis.fetch;

function mockFetch(jrd) {
  return async () => new Response(JSON.stringify(jrd), {
    status: 200,
    headers: { 'content-type': 'application/jrd+json' }
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('lookup resolves the remotestorage link', async () => {
  globalThis.fetch = mockFetch({
    subject: 'acct:user@example.com',
    links: [
      {
        rel: 'remotestorage',
        href: 'https://storage.example.com/user/',
        properties: {
          'http://tools.ietf.org/html/rfc6749#section-4.2': 'https://auth.example.com/oauth',
          'http://remotestorage.io/spec/version': 'draft-dejong-remotestorage-05'
        }
      }
    ],
    properties: {}
  });

  const result = await discovery.lookup('user@example.com');

  assert.equal(result.href, 'https://storage.example.com/user/');
  assert.equal(result.authURL, 'https://auth.example.com/oauth');
  assert.equal(result.version, 'draft-dejong-remotestorage-05');
});

test('lookup rejects when no remotestorage link is present', async () => {
  globalThis.fetch = mockFetch({ subject: 'acct:user@example.com', links: [] });

  await assert.rejects(
    () => discovery.lookup('user@example.com'),
    /does not have remotestorage defined/
  );
});
