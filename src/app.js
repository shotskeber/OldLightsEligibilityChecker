import {
  hasBungieConfig,
  beginBungieLogin,
  clearSession,
  fetchAccountEligibility,
  getMembershipTypeLabel,
  getPublicConfigStatus,
  handleBungieRedirect,
} from './lib/bungie-api.js';

const signInButton = document.querySelector('#sign-in-button');
const signOutButton = document.querySelector('#sign-out-button');
const configWarning = document.querySelector('#config-warning');
const configDetails = document.querySelector('#config-details');
const statusPanel = document.querySelector('.status-panel');
const statusText = document.querySelector('#status-text');
const statusDetail = document.querySelector('#status-detail');
const accountSummary = document.querySelector('#account-summary');
const sharingPsa = document.querySelector('#sharing-psa');
const errorBanner = document.querySelector('#error-banner');
const timeColumnLabel = document.querySelector('#time-column-label');
const eligibilityColumnLabel = document.querySelector('#eligibility-column-label');
const activityStatsPanel = document.querySelector('#activity-stats-panel');
const activityStatsSummary = document.querySelector('#activity-stats-summary');
const activityStatsEmpty = document.querySelector('#activity-stats-empty');
const activityStatsDetail = document.querySelector('#activity-stats-detail');
const activityTimelineList = document.querySelector('#activity-timeline-list');
const loadingModal = document.querySelector('#loading-modal');
const loadingDetail = document.querySelector('#loading-detail');
const almostThereModal = document.querySelector('#almost-there-modal');
const almostThereClose = document.querySelector('#almost-there-close');
const criteriaRows = [...document.querySelectorAll('.criteria-row')];
const ALMOST_THERE_DISMISSED_KEY = 'old-lights-almost-there-dismissed';
const EXPANSION_MARKERS = new Map([
  ['Destiny 2', '\u26AA'],
  ['Forsaken', '\uD83E\uDEA6'],
  ['Shadowkeep', '\uD83C\uDF15'],
  ['Beyond Light', '\uD83E\uDDCA'],
  ['Witch Queen', '\uD83D\uDC51'],
  ['Lightfall', '\u2747\uFE0F'],
  ['The Final Shape', '\uD83D\uDD3A'],
  ['The Year of Prophecy', '\uD83D\uDC41\uFE0F'],
]);

const initialRows = criteriaRows.map((row) => ({
  label: row.dataset.periodLabel,
  required: row.querySelector('.criteria-rule-copy').textContent,
  status: row.querySelector('.criteria-status').textContent,
}));

signInButton.addEventListener('click', () => {
  clearError();
  if (!hasBungieConfig()) {
    showConfigWarning();
    return;
  }

  beginBungieLogin();
});

almostThereClose.addEventListener('click', dismissAlmostThereModal);

signOutButton.addEventListener('click', () => {
  clearSession();
  accountSummary.hidden = true;
  signInButton.hidden = false;
  signOutButton.hidden = true;
  clearError();
  hideLoadingModal();
  hideAlmostThereModal();
  resetEligibilityTable();
  resetActivityStats();
  sharingPsa.hidden = true;
  sessionStorage.removeItem(ALMOST_THERE_DISMISSED_KEY);
  setStatus('Ready to check your account', 'We compute everything live and do not save account results.');
});

resetEligibilityTable();
resetActivityStats();
await initializeApp();

async function initializeApp() {
  if (!hasBungieConfig()) {
    showConfigWarning();
  }

  try {
    setStatus('Checking sign-in state', 'Looking for an active Bungie session or a fresh login callback.');
    const redirectResult = await handleBungieRedirect().catch((error) => {
      showError(error.message);
      return { handled: false };
    });

    const token = redirectResult?.token;
    if (!token) {
      clearSession();
      setStatus('Ready to check your account', 'Sign in with Bungie to calculate your Old Lights eligibility.');
      return;
    }

    signInButton.hidden = true;
    signOutButton.hidden = false;
    markEligibilityTableLoading();
    showLoadingModal('Fetching memberships and account history from Bungie.');
    setStatus('Fetching Destiny history', 'Pulling memberships, characters, and activity history from Bungie.');

    const result = await fetchAccountEligibility(token.accessToken, {
      onProgress: updateLoadingProgress,
    });

    renderAccountSummary(result.account);
    renderEligibility(result);
    renderActivityStats(result.activityStats);
    sharingPsa.hidden = false;
    hideLoadingModal();
    setStatus(
      result.eligible ? 'Eligible for Old Lights' : 'Not currently eligible',
      result.eligible
        ? 'Your account has recorded playtime in every listed expansion year.'
        : 'At least one listed expansion year has no recorded playtime.'
    );
    statusPanel.dataset.verdict = result.eligible ? 'eligible' : 'missing';
    maybeShowAlmostThereModal(result.uiHints);
  } catch (error) {
    hideLoadingModal();
    hideAlmostThereModal();
    showError(error.message);
    signInButton.hidden = false;
    signOutButton.hidden = true;
  }
}

function setStatus(title, detail) {
  statusText.textContent = title;
  statusDetail.textContent = detail;
}

function showConfigWarning() {
  const configStatus = getPublicConfigStatus();
  configWarning.hidden = false;
  configDetails.hidden = false;
  configDetails.innerHTML = `
    <p class="config-detail-copy">Missing values: ${configStatus.missingFields.map(escapeHtml).join(', ')}</p>
    <p class="config-detail-copy">Bungie redirect URL: <code>${escapeHtml(configStatus.callbackUrl)}</code></p>
  `;
  setStatus('Configuration needed', 'Add your Bungie public client ID and API key, then reload the page.');
}

function clearError() {
  errorBanner.hidden = true;
  errorBanner.textContent = '';
}

function showError(message) {
  accountSummary.hidden = true;
  sharingPsa.hidden = true;
  resetActivityStats();
  hideAlmostThereModal();
  errorBanner.hidden = false;
  errorBanner.textContent = message;
  setStatus('Unable to complete check', 'Review the message below and try again when you are ready.');
  resetEligibilityTable();
}

function renderAccountSummary(account) {
  const membershipLabels = account.memberships.map((membership) => getMembershipTypeLabel(membership.membershipType)).join(', ');
  accountSummary.hidden = false;
  accountSummary.innerHTML = `
    <div class="summary-name">${escapeHtml(account.displayName)}</div>
    <div class="summary-meta">${account.characterCount} characters across ${account.membershipCount} memberships</div>
    <div class="summary-meta">Platforms: ${escapeHtml(membershipLabels)}</div>
  `;
}

function resetEligibilityTable() {
  timeColumnLabel.textContent = 'Required playtime';
  eligibilityColumnLabel.textContent = 'Status';
  statusPanel.dataset.verdict = '';
  sharingPsa.hidden = true;

  for (const rowState of initialRows) {
    const row = criteriaRows.find((candidate) => candidate.dataset.periodLabel === rowState.label);
    row.dataset.state = 'pending';
    row.querySelector('.criteria-rule-copy').textContent = rowState.required;
    row.querySelector('.criteria-status').textContent = rowState.status;
  }
}

function resetActivityStats() {
  activityStatsPanel.hidden = true;
  activityStatsSummary.innerHTML = '';
  activityTimelineList.innerHTML = '';
  activityStatsEmpty.hidden = true;
  activityStatsDetail.hidden = true;
}

function markEligibilityTableLoading() {
  timeColumnLabel.textContent = 'Time played';
  eligibilityColumnLabel.textContent = 'Eligible';

  for (const row of criteriaRows) {
    row.dataset.state = 'loading';
    row.querySelector('.criteria-rule-copy').textContent = 'Checking...';
    row.querySelector('.criteria-status').textContent = '...';
  }
}

function renderEligibility(result) {
  timeColumnLabel.textContent = 'Time played';
  eligibilityColumnLabel.textContent = 'Eligible';

  for (const period of result.periods) {
    const row = criteriaRows.find((candidate) => candidate.dataset.periodLabel === period.label);
    if (!row) {
      continue;
    }

    row.dataset.state = period.isEligible ? 'eligible' : 'missing';
    row.querySelector('.criteria-rule-copy').textContent = period.formattedPlaytime;
    row.querySelector('.criteria-status').innerHTML = `
      <span class="result-pill ${period.isEligible ? 'result-pill-yes' : 'result-pill-no'}">
        ${period.isEligible ? 'Yes' : 'No'}
      </span>
    `;
  }
}

function renderActivityStats(activityStats) {
  resetActivityStats();
  activityStatsPanel.hidden = false;

  if (!activityStats?.available) {
    activityStatsEmpty.hidden = false;
    return;
  }

  activityStatsSummary.innerHTML = [
    renderStatCard('First Recorded', formatLongDate(activityStats.firstRecorded?.date), activityStats.firstRecorded?.expansionLabel, 'calendar'),
    renderStatCard('Last Recorded', formatLongDate(activityStats.lastRecorded?.date), activityStats.lastRecorded?.expansionLabel, 'calendar'),
    renderStatCard('Total Active Days', formatNumber(activityStats.totalActiveDays), 'Across all years', 'signal'),
    renderStatCard(
      'Longest Streak',
      formatDayCount(activityStats.longestStreak?.days ?? 0),
      activityStats.longestStreak?.expansionLabel ?? 'No streak recorded',
      'flame'
    ),
  ].join('');

  activityTimelineList.innerHTML = activityStats.expansions
    .map((expansion) => {
      const firstDate = expansion.firstActivityDate ? formatShortDate(expansion.firstActivityDate) : 'None';
      const lastDate = expansion.lastActivityDate ? formatShortDate(expansion.lastActivityDate) : 'None';
      const timeline = expansion.timelineDays
        .map(
          (isActive, index) =>
            `<span class="timeline-day ${isActive ? 'is-active' : 'is-inactive'}" style="--timeline-index:${index}" aria-hidden="true"></span>`
        )
        .join('');

      return `
        <div class="timeline-row">
          <div class="timeline-era">
            <span class="timeline-era-mark" aria-hidden="true">${escapeHtml(EXPANSION_MARKERS.get(expansion.label) ?? '')}</span>
            <span>${escapeHtml(expansion.label)}</span>
          </div>
          <div
            class="timeline-track"
            style="--timeline-length:${expansion.timelineDays.length || 1}"
            aria-label="${escapeHtml(expansion.label)} activity timeline"
          >${timeline}</div>
          <div class="timeline-meta">
            <span class="timeline-count">${escapeHtml(formatDayCount(expansion.activeDayCount))}</span>
            <span class="timeline-dates">First ${escapeHtml(firstDate)}</span>
            <span class="timeline-dates">Last ${escapeHtml(lastDate)}</span>
          </div>
        </div>
      `;
    })
    .join('');

  activityStatsDetail.hidden = false;
}

function showLoadingModal(message) {
  loadingDetail.textContent = message;
  loadingModal.hidden = false;
}

function hideLoadingModal() {
  loadingModal.hidden = true;
}

function updateLoadingProgress(progress) {
  const parts = [progress.message].filter(Boolean);
  if (progress.charactersDone || progress.charactersTotal) {
    parts.push(`${progress.charactersDone ?? 0}/${progress.charactersTotal ?? '?'} characters`);
  }
  if (progress.pagesFetched) {
    parts.push(`${progress.pagesFetched} activity pages`);
  }

  showLoadingModal(parts.join(' - '));
}

function maybeShowAlmostThereModal(uiHints) {
  if (!uiHints?.almostThere) {
    hideAlmostThereModal();
    return;
  }

  if (sessionStorage.getItem(ALMOST_THERE_DISMISSED_KEY) === '1') {
    return;
  }

  almostThereModal.hidden = false;
}

function dismissAlmostThereModal() {
  sessionStorage.setItem(ALMOST_THERE_DISMISSED_KEY, '1');
  hideAlmostThereModal();
}

function hideAlmostThereModal() {
  almostThereModal.hidden = true;
}

function renderStatCard(label, value, detail, tone) {
  return `
    <article class="stats-card stats-card-${tone}">
      <span class="stats-card-label">${escapeHtml(label)}</span>
      <strong class="stats-card-value">${escapeHtml(value)}</strong>
      <span class="stats-card-detail">${escapeHtml(detail)}</span>
    </article>
  `;
}

function formatLongDate(isoDay) {
  if (!isoDay) {
    return 'No activity found';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDay}T00:00:00.000Z`));
}

function formatShortDate(isoDay) {
  if (!isoDay) {
    return 'None';
  }

  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${isoDay}T00:00:00.000Z`));

  return formatted.replace(',', '');
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value ?? 0);
}

function formatDayCount(value) {
  return `${formatNumber(value ?? 0)}d`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
