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
const loadingModal = document.querySelector('#loading-modal');
const loadingDetail = document.querySelector('#loading-detail');
const criteriaRows = [...document.querySelectorAll('.criteria-row')];

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

signOutButton.addEventListener('click', () => {
  clearSession();
  accountSummary.hidden = true;
  signInButton.hidden = false;
  signOutButton.hidden = true;
  clearError();
  hideLoadingModal();
  resetEligibilityTable();
  sharingPsa.hidden = true;
  setStatus('Ready to check your account', 'We compute everything live and do not save account results.');
});

resetEligibilityTable();
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
    sharingPsa.hidden = false;
    hideLoadingModal();
    setStatus(
      result.eligible ? 'Eligible for Old Lights' : 'Not currently eligible',
      result.eligible
        ? 'Your account has recorded playtime in every listed expansion year.'
        : 'At least one listed expansion year has no recorded playtime.'
    );
    statusPanel.dataset.verdict = result.eligible ? 'eligible' : 'missing';
  } catch (error) {
    hideLoadingModal();
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
