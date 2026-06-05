import test from 'node:test';
import assert from 'node:assert/strict';

import { getConfigStatus } from '../src/lib/config-status.js';

test('getConfigStatus reports missing Bungie variables and preserves the callback URL', () => {
  const status = getConfigStatus({
    appUrl: 'https://old-lights-eligibility-checker.vercel.app',
    apiKey: '',
    clientId: '',
  });

  assert.equal(status.isReady, false);
  assert.deepEqual(status.missingFields, ['NEXT_PUBLIC_BUNGIE_CLIENT_ID', 'NEXT_PUBLIC_BUNGIE_API_KEY']);
  assert.equal(status.callbackUrl, 'https://old-lights-eligibility-checker.vercel.app/');
});

test('getConfigStatus marks config ready when Bungie client ID and API key are present', () => {
  const status = getConfigStatus({
    appUrl: 'http://localhost:4173',
    apiKey: 'abc123',
    clientId: '456',
  });

  assert.equal(status.isReady, true);
  assert.deepEqual(status.missingFields, []);
  assert.equal(status.callbackUrl, 'http://localhost:4173/');
});
