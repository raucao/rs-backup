import { test } from 'node:test';
import assert from 'node:assert/strict';

import encodePath from '../encode-path.js';
import addQueryParamsToURL from '../add-query-params-to-url.js';

test('encodePath encodes components but preserves slashes', () => {
  assert.equal(encodePath('foo/bar baz.txt'), 'foo/bar%20baz.txt');
  assert.equal(encodePath('muc.5apps.com/'), 'muc.5apps.com/');
});

test('addQueryParamsToURL appends params with a question mark', () => {
  const url = addQueryParamsToURL('https://auth.example.com/oauth', {
    client_id: 'rs-backup.5apps.com',
    scope: '*:rw'
  });

  assert.equal(url, 'https://auth.example.com/oauth?client_id=rs-backup.5apps.com&scope=*%3Arw');
});

test('addQueryParamsToURL uses an ampersand when a query already exists', () => {
  const url = addQueryParamsToURL('https://auth.example.com/oauth?foo=bar', {
    scope: '*:rw'
  });

  assert.equal(url, 'https://auth.example.com/oauth?foo=bar&scope=*%3Arw');
});
