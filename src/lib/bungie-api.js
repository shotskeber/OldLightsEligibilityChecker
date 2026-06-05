import { buildActivityWindow, calculateEligibility } from './eligibility.js';
import { getConfigStatus } from './config-status.js';

const API_ROOT = 'https://www.bungie.net/Platform';
const AUTH_ROOT = 'https://www.bungie.net/en/OAuth/Authorize';
const TOKEN_URL = 'https://www.bungie.net/Platform/App/OAuth/Token/';
const MEMBERSHIP_TYPE_ALL = -1;
const GENERAL_GROUP = 1;
const ACTIVITY_MODE_ALL = 0;
const PAGE_SIZE = 250;
const PAGE_STRIDE = 3;
const TOKEN_STORAGE_KEY = 'old-lights-access-token';
const STATE_STORAGE_KEY = 'old-lights-oauth-state';

function getConfig() {
  const config = window.__APP_CONFIG__ ?? {};
  return {
    apiKey: config.BUNGIE_API_KEY ?? '',
    appUrl: config.APP_URL || window.location.origin,
    clientId: config.BUNGIE_CLIENT_ID ?? '',
  };
}

function getHeaders(token) {
  const { apiKey } = getConfig();

  return {
    Authorization: `Bearer ${token}`,
    'X-API-Key': apiKey,
  };
}

async function requestJson(pathname, token, options = {}) {
  const response = await fetch(`${API_ROOT}${pathname}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(token ? getHeaders(token) : {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ErrorCode && payload.ErrorCode !== 1) {
    const message = normalizeBungieError(payload, response.status);
    throw new Error(message);
  }

  return payload.Response;
}

function normalizeBungieError(payload, status) {
  const rawMessage = payload?.Message || payload?.ErrorStatus || `Bungie API error (${status})`;
  const normalized = String(rawMessage).toLowerCase();

  if (
    normalized.includes('destinyaccountnotfound') ||
    normalized.includes('destiny account') && normalized.includes('not found') ||
    normalized.includes('unable to find your destiny account')
  ) {
    return (
      'Bungie login worked, but no Destiny 2 profile was returned for this Bungie account. ' +
      'Make sure you are signed into the Bungie.net account linked to your Destiny 2 platform account, then try again.'
    );
  }

  return rawMessage;
}

function createState() {
  return crypto.randomUUID();
}

export function getStoredToken() {
  const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  const token = JSON.parse(raw);
  if (Date.now() >= token.expiresAt) {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }

  return token;
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(STATE_STORAGE_KEY);
}

export function hasBungieConfig() {
  return getPublicConfigStatus().isReady;
}

export function getPublicConfigStatus() {
  return getConfigStatus(getConfig());
}

export function beginBungieLogin() {
  const { appUrl, clientId } = getConfig();
  const state = createState();
  const redirectUri = new URL('/', appUrl).toString();
  const authUrl = new URL(AUTH_ROOT);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  sessionStorage.setItem(STATE_STORAGE_KEY, state);
  window.location.assign(authUrl.toString());
}

export async function handleBungieRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const state = url.searchParams.get('state');

  if (!code && !error) {
    return { handled: false };
  }

  if (error) {
    clearSearchParams(url);
    throw new Error(error === 'access_denied' ? 'Bungie login was canceled.' : `Bungie auth error: ${error}`);
  }

  const expectedState = sessionStorage.getItem(STATE_STORAGE_KEY);
  if (!state || !expectedState || state !== expectedState) {
    clearSearchParams(url);
    throw new Error('Bungie auth state did not match. Please try signing in again.');
  }

  const { appUrl, clientId } = getConfig();
  const redirectUri = new URL('/', appUrl).toString();
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  clearSearchParams(url);

  if (!response.ok || !payload.access_token) {
    throw new Error(payload?.error_description || payload?.error || 'Bungie token exchange failed.');
  }

  const token = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
    membershipId: payload.membership_id ?? '',
  };

  sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  sessionStorage.removeItem(STATE_STORAGE_KEY);

  return {
    handled: true,
    token,
  };
}

function clearSearchParams(url) {
  window.history.replaceState({}, document.title, url.pathname);
}

export async function fetchAccountEligibility(token, options = {}) {
  const emitProgress = options.onProgress ?? (() => {});
  emitProgress({ phase: 'memberships', message: 'Finding linked Destiny memberships.' });
  const membershipResponse = await requestJson('/User/GetMembershipsForCurrentUser/', token);
  const destinyMemberships = membershipResponse?.destinyMemberships ?? [];

  if (!destinyMemberships.length) {
    throw new Error(
      'Bungie login worked, but no Destiny 2 profile was returned for this Bungie account. ' +
      'Make sure you are signed into the Bungie.net account linked to your Destiny 2 platform account, then try again.'
    );
  }

  const displayName = membershipResponse?.bungieNetUser?.displayName ?? 'Guardian';
  const activities = [];
  const processedCharacters = [];
  let membershipsDone = 0;
  let charactersDone = 0;
  let charactersTotal = 0;
  let pagesFetched = 0;

  for (const membership of destinyMemberships) {
    emitProgress({
      phase: 'account-stats',
      message: `Loading account stats for ${getMembershipTypeLabel(membership.membershipType)}.`,
      membershipsDone,
      membershipsTotal: destinyMemberships.length,
      charactersDone,
      charactersTotal,
      pagesFetched,
    });

    const history = await requestJson(
      `/Destiny2/${membership.membershipType}/Account/${membership.membershipId}/Stats/?groups=${GENERAL_GROUP}`,
      token
    );

    const characters = history?.characters ?? [];
    charactersTotal += characters.length;
    for (const character of characters) {
      processedCharacters.push({
        characterId: character.characterId,
        membershipId: membership.membershipId,
        membershipType: membership.membershipType,
      });

      const activityWindows = await fetchCharacterActivityHistory(
        token,
        membership.membershipType,
        membership.membershipId,
        character.characterId,
        (page) => {
          pagesFetched += 1;
          emitProgress({
            phase: 'activity-history',
            message: `Checking activity page ${page} for character ${charactersDone + 1}.`,
            membershipsDone,
            membershipsTotal: destinyMemberships.length,
            charactersDone,
            charactersTotal,
            pagesFetched,
          });
        }
      );

      activities.push(...activityWindows);
      charactersDone += 1;
      emitProgress({
        phase: 'characters',
        message: `Finished character ${charactersDone} of ${charactersTotal}.`,
        membershipsDone,
        membershipsTotal: destinyMemberships.length,
        charactersDone,
        charactersTotal,
        pagesFetched,
      });
    }

    membershipsDone += 1;
  }

  if (!activities.length) {
    throw new Error('No usable Destiny 2 history was returned for this account.');
  }

  emitProgress({
    phase: 'calculating',
    message: 'Calculating Old Lights eligibility.',
    membershipsDone,
    membershipsTotal: destinyMemberships.length,
    charactersDone,
    charactersTotal,
    pagesFetched,
  });

  const eligibility = calculateEligibility(activities);
  return {
    ...eligibility,
    account: {
      displayName,
      membershipCount: destinyMemberships.length,
      characterCount: processedCharacters.length,
      memberships: destinyMemberships.map((membership) => ({
        iconPath: membership.iconPath ?? '',
        membershipId: membership.membershipId,
        membershipType: membership.membershipType,
      })),
    },
  };
}

async function fetchCharacterActivityHistory(token, membershipType, membershipId, characterId, onPageFetched = () => {}) {
  const windows = [];
  let pendingPages = [0, 1, 2];

  while (pendingPages.length) {
    const page = pendingPages.shift();
    const response = await requestJson(
      `/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/Activities/?count=${PAGE_SIZE}&mode=${ACTIVITY_MODE_ALL}&page=${page}`,
      token
    );

    const activities = response?.activities ?? [];
    onPageFetched(page);
    if (activities.length) {
      pendingPages.push(page + PAGE_STRIDE);
      windows.push(...activities.map(buildActivityWindow).filter((activity) => activity.secondsPlayed > 0));
    }
  }

  return windows;
}

export function getMembershipTypeLabel(membershipType) {
  const mapping = new Map([
    [1, 'Xbox'],
    [2, 'PlayStation'],
    [3, 'Steam'],
    [4, 'Battle.net'],
    [5, 'Stadia'],
    [6, 'Epic'],
    [10, 'Demon'],
    [254, 'BungieNext'],
    [MEMBERSHIP_TYPE_ALL, 'All'],
  ]);

  return mapping.get(Number(membershipType)) ?? `Type ${membershipType}`;
}
