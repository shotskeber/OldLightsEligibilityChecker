import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

globalThis.window = {
  __APP_CONFIG__: {
    BUNGIE_API_KEY: 'api-key',
    APP_URL: 'https://example.com',
    BUNGIE_CLIENT_ID: 'client-id',
  },
  location: { origin: 'https://example.com' },
};

const { fetchAccountEligibility } = await import('../src/lib/bungie-api.js');

afterEach(() => {
  globalThis.fetch = undefined;
});

test('fetchAccountEligibility reports progress while fetching activity pages', async () => {
  const progressEvents = [];
  const responses = new Map([
    [
      '/User/GetMembershipsForCurrentUser/',
      {
        bungieNetUser: { displayName: 'TestGuardian' },
        destinyMemberships: [{ membershipId: '123', membershipType: 3 }],
      },
    ],
    [
      '/Destiny2/3/Account/123/Stats/?groups=1',
      {
        characters: [{ characterId: 'abc' }],
      },
    ],
    [
      '/Destiny2/3/Account/123/Character/abc/Stats/Activities/?count=250&mode=0&page=0',
      {
        activities: [
          {
            period: '2017-09-06T00:00:00Z',
            values: {
              startSeconds: { basic: { value: 0 } },
              timePlayedSeconds: { basic: { value: 3600 } },
            },
          },
        ],
      },
    ],
    ['/Destiny2/3/Account/123/Character/abc/Stats/Activities/?count=250&mode=0&page=1', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/abc/Stats/Activities/?count=250&mode=0&page=2', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/abc/Stats/Activities/?count=250&mode=0&page=3', { activities: [] }],
  ]);

  globalThis.fetch = async (url) => {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.replace(/^\/Platform/, '') + parsedUrl.search;
    assert.ok(responses.has(pathname), `Unexpected request: ${pathname}`);
    return {
      ok: true,
      json: async () => ({ Response: responses.get(pathname) }),
    };
  };

  const result = await fetchAccountEligibility('token', {
    onProgress: (event) => progressEvents.push(event),
  });

  assert.equal(result.account.displayName, 'TestGuardian');
  assert.ok(progressEvents.some((event) => event.phase === 'activity-history'));
  assert.ok(progressEvents.some((event) => event.phase === 'calculating'));
  assert.equal(progressEvents.at(-1).pagesFetched, 4);
});

test('fetchAccountEligibility skips stale memberships and keeps checking valid linked memberships', async () => {
  const requestedHosts = [];
  const responses = new Map([
    [
      '/User/GetMembershipsForCurrentUser/',
      {
        bungieNetUser: { displayName: 'CrossSaveGuardian' },
        destinyMemberships: [
          { membershipId: 'stale', membershipType: 2 },
          { membershipId: 'valid', membershipType: 3 },
        ],
      },
    ],
    [
      '/Destiny2/3/Account/valid/Stats/?groups=1',
      {
        characters: [{ characterId: 'hunter' }],
      },
    ],
    [
      '/Destiny2/3/Account/valid/Character/hunter/Stats/Activities/?count=250&mode=0&page=0',
      {
        activities: [
          {
            period: '2017-09-06T00:00:00Z',
            values: {
              startSeconds: { basic: { value: 0 } },
              timePlayedSeconds: { basic: { value: 1800 } },
            },
          },
        ],
      },
    ],
    ['/Destiny2/3/Account/valid/Character/hunter/Stats/Activities/?count=250&mode=0&page=1', { activities: [] }],
    ['/Destiny2/3/Account/valid/Character/hunter/Stats/Activities/?count=250&mode=0&page=2', { activities: [] }],
    ['/Destiny2/3/Account/valid/Character/hunter/Stats/Activities/?count=250&mode=0&page=3', { activities: [] }],
  ]);

  globalThis.fetch = async (url) => {
    const parsedUrl = new URL(url);
    requestedHosts.push(parsedUrl.host);
    const pathname = parsedUrl.pathname.replace(/^\/Platform/, '') + parsedUrl.search;

    if (pathname === '/Destiny2/2/Account/stale/Stats/?groups=1') {
      return {
        ok: true,
        json: async () => ({
          ErrorCode: 1601,
          Message: 'We were unable to find your Destiny account information.',
        }),
      };
    }

    assert.ok(responses.has(pathname), `Unexpected request: ${pathname}`);
    return {
      ok: true,
      json: async () => ({ ErrorCode: 1, Response: responses.get(pathname) }),
    };
  };

  const result = await fetchAccountEligibility('token');

  assert.equal(result.account.displayName, 'CrossSaveGuardian');
  assert.equal(result.account.membershipCount, 1);
  assert.equal(result.account.skippedMembershipCount, 1);
  assert.equal(result.account.memberships[0].membershipId, 'valid');
  assert.ok(requestedHosts.includes('stats.bungie.net'));
});

test('fetchAccountEligibility includes merged legacy and deleted character ids without duplicates', async () => {
  const requestedCharacterIds = [];
  const responses = new Map([
    [
      '/User/GetMembershipsForCurrentUser/',
      {
        bungieNetUser: { displayName: 'LegacyGuardian' },
        destinyMemberships: [{ membershipId: '123', membershipType: 3 }],
      },
    ],
    [
      '/Destiny2/3/Account/123/Stats/?groups=1',
      {
        characters: [{ characterId: 'live-1' }, { characterId: 'live-2' }],
        mergedAllCharacters: [{ characterId: 'live-2' }, { characterId: 'legacy-1' }],
        mergedDeletedCharacters: ['legacy-2'],
      },
    ],
    [
      '/Destiny2/3/Account/123/Character/live-1/Stats/Activities/?count=250&mode=0&page=0',
      {
        activities: [
          {
            period: '2017-09-06T00:00:00Z',
            values: {
              startSeconds: { basic: { value: 0 } },
              timePlayedSeconds: { basic: { value: 600 } },
            },
          },
        ],
      },
    ],
    ['/Destiny2/3/Account/123/Character/live-1/Stats/Activities/?count=250&mode=0&page=1', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/live-1/Stats/Activities/?count=250&mode=0&page=2', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/live-1/Stats/Activities/?count=250&mode=0&page=3', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/live-2/Stats/Activities/?count=250&mode=0&page=0', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/live-2/Stats/Activities/?count=250&mode=0&page=1', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/live-2/Stats/Activities/?count=250&mode=0&page=2', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/live-2/Stats/Activities/?count=250&mode=0&page=3', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/legacy-1/Stats/Activities/?count=250&mode=0&page=0', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/legacy-1/Stats/Activities/?count=250&mode=0&page=1', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/legacy-1/Stats/Activities/?count=250&mode=0&page=2', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/legacy-1/Stats/Activities/?count=250&mode=0&page=3', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/legacy-2/Stats/Activities/?count=250&mode=0&page=0', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/legacy-2/Stats/Activities/?count=250&mode=0&page=1', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/legacy-2/Stats/Activities/?count=250&mode=0&page=2', { activities: [] }],
    ['/Destiny2/3/Account/123/Character/legacy-2/Stats/Activities/?count=250&mode=0&page=3', { activities: [] }],
  ]);

  globalThis.fetch = async (url) => {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.replace(/^\/Platform/, '') + parsedUrl.search;
    const match = pathname.match(/\/Character\/([^/]+)\//);
    if (match) {
      requestedCharacterIds.push(match[1]);
    }

    assert.ok(responses.has(pathname), `Unexpected request: ${pathname}`);
    return {
      ok: true,
      json: async () => ({ ErrorCode: 1, Response: responses.get(pathname) }),
    };
  };

  const result = await fetchAccountEligibility('token');

  assert.equal(result.account.characterCount, 4);
  assert.deepEqual([...new Set(requestedCharacterIds)].sort(), ['legacy-1', 'legacy-2', 'live-1', 'live-2']);
});

test('fetchAccountEligibility merges linked profiles without double-counting duplicate memberships', async () => {
  const statsRequests = [];
  const responses = new Map([
    [
      '/User/GetMembershipsForCurrentUser/',
      {
        bungieNetUser: { displayName: 'LinkedGuardian' },
        destinyMemberships: [{ membershipId: 'steam-main', membershipType: 3 }],
      },
    ],
    [
      '/Destiny2/3/Profile/steam-main/LinkedProfiles/?getAllMemberships=true',
      {
        profiles: [
          { membershipId: 'steam-main', membershipType: 3 },
          { membershipId: 'psn-side', membershipType: 2 },
        ],
      },
    ],
    [
      '/Destiny2/3/Account/steam-main/Stats/?groups=1',
      {
        characters: [{ characterId: 'steam-char' }],
      },
    ],
    [
      '/Destiny2/2/Account/psn-side/Stats/?groups=1',
      {
        characters: [{ characterId: 'psn-char' }],
      },
    ],
    [
      '/Destiny2/3/Account/steam-main/Character/steam-char/Stats/Activities/?count=250&mode=0&page=0',
      {
        activities: [
          {
            period: '2017-09-06T00:00:00Z',
            values: {
              startSeconds: { basic: { value: 0 } },
              timePlayedSeconds: { basic: { value: 1200 } },
            },
          },
        ],
      },
    ],
    ['/Destiny2/3/Account/steam-main/Character/steam-char/Stats/Activities/?count=250&mode=0&page=1', { activities: [] }],
    ['/Destiny2/3/Account/steam-main/Character/steam-char/Stats/Activities/?count=250&mode=0&page=2', { activities: [] }],
    ['/Destiny2/3/Account/steam-main/Character/steam-char/Stats/Activities/?count=250&mode=0&page=3', { activities: [] }],
    [
      '/Destiny2/2/Account/psn-side/Character/psn-char/Stats/Activities/?count=250&mode=0&page=0',
      {
        activities: [
          {
            period: '2018-05-10T00:00:00Z',
            values: {
              startSeconds: { basic: { value: 0 } },
              timePlayedSeconds: { basic: { value: 900 } },
            },
          },
        ],
      },
    ],
    ['/Destiny2/2/Account/psn-side/Character/psn-char/Stats/Activities/?count=250&mode=0&page=1', { activities: [] }],
    ['/Destiny2/2/Account/psn-side/Character/psn-char/Stats/Activities/?count=250&mode=0&page=2', { activities: [] }],
    ['/Destiny2/2/Account/psn-side/Character/psn-char/Stats/Activities/?count=250&mode=0&page=3', { activities: [] }],
  ]);

  globalThis.fetch = async (url) => {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.replace(/^\/Platform/, '') + parsedUrl.search;

    if (pathname.includes('/Stats/?groups=1')) {
      statsRequests.push(pathname);
    }

    assert.ok(responses.has(pathname), `Unexpected request: ${pathname}`);
    return {
      ok: true,
      json: async () => ({ ErrorCode: 1, Response: responses.get(pathname) }),
    };
  };

  const result = await fetchAccountEligibility('token');

  assert.equal(result.account.membershipCount, 2);
  assert.equal(result.account.characterCount, 2);
  assert.deepEqual(statsRequests.sort(), [
    '/Destiny2/2/Account/psn-side/Stats/?groups=1',
    '/Destiny2/3/Account/steam-main/Stats/?groups=1',
  ]);
});
