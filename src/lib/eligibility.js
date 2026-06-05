export const OLD_LIGHTS_PERIODS = [
  { label: 'Destiny 2', start: '2017-09-06', end: '2018-09-03' },
  { label: 'Forsaken', start: '2018-09-04', end: '2019-09-30' },
  { label: 'Shadowkeep', start: '2019-10-01', end: '2020-11-09' },
  { label: 'Beyond Light', start: '2020-11-10', end: '2022-02-21' },
  { label: 'Witch Queen', start: '2022-02-22', end: '2023-02-27' },
  { label: 'Lightfall', start: '2023-02-28', end: '2024-06-03' },
  { label: 'The Final Shape', start: '2024-06-04', end: '2025-07-14' },
  { label: 'The Year of Prophecy', start: '2025-07-15', end: '2026-06-08' },
];

function startOfUtcDay(isoDate) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function endOfUtcDay(isoDate) {
  return new Date(`${isoDate}T23:59:59.999Z`);
}

export function buildActivityWindow(activity) {
  const periodStart = new Date(activity.period);
  const startSeconds = Number(activity?.values?.startSeconds?.basic?.value ?? 0);
  const timePlayedSeconds = Number(activity?.values?.timePlayedSeconds?.basic?.value ?? 0);
  const start = new Date(periodStart.getTime() + startSeconds * 1000);
  const end = new Date(start.getTime() + timePlayedSeconds * 1000);

  return {
    start,
    end,
    secondsPlayed: timePlayedSeconds,
  };
}

function formatPlaytime(totalSeconds) {
  if (totalSeconds <= 0) {
    return '0m';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function getOverlapSeconds(activity, periodStart, periodEnd) {
  const overlapStart = Math.max(activity.start.getTime(), periodStart.getTime());
  const overlapEnd = Math.min(activity.end.getTime(), periodEnd.getTime());

  if (overlapEnd <= overlapStart) {
    return 0;
  }

  return Math.round((overlapEnd - overlapStart) / 1000);
}

export function calculateEligibility(activities) {
  const periods = OLD_LIGHTS_PERIODS.map((period) => {
    const start = startOfUtcDay(period.start);
    const end = endOfUtcDay(period.end);
    const totalSeconds = activities.reduce((sum, activity) => {
      return sum + getOverlapSeconds(activity, start, end);
    }, 0);

    return {
      ...period,
      totalSeconds,
      formattedPlaytime: formatPlaytime(totalSeconds),
      isEligible: totalSeconds > 0,
    };
  });

  return {
    eligible: periods.every((period) => period.isEligible),
    periods,
  };
}
