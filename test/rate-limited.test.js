import { test } from 'node:test';
import assert from 'node:assert/strict';

import rateLimited from '../rate-limited.js';

test('rateLimited serializes calls in order and returns their results', async () => {
  const order = [];
  const limited = rateLimited(async (value) => {
    order.push(value);
    return value * 2;
  }, 1);

  const results = await Promise.all([limited(1), limited(2), limited(3)]);

  assert.deepEqual(order, [1, 2, 3]);
  assert.deepEqual(results, [2, 4, 6]);
});

test('rateLimited keeps processing after a rejection', async () => {
  const limited = rateLimited(async (value) => {
    if (value === 1) throw new Error('boom');
    return value;
  }, 1);

  await assert.rejects(() => limited(1), /boom/);
  assert.equal(await limited(2), 2);
});
