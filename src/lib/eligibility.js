export const OLD_LIGHTS_PERIODS = [
  { label: 'Destiny 2', start: '2017-09-06T17:00:00.000Z', end: '2018-09-04T17:00:00.000Z' },
  { label: 'Forsaken', start: '2018-09-04T17:00:00.000Z', end: '2019-10-01T17:00:00.000Z' },
  { label: 'Shadowkeep', start: '2019-10-01T17:00:00.000Z', end: '2020-11-10T17:00:00.000Z' },
  { label: 'Beyond Light', start: '2020-11-10T17:00:00.000Z', end: '2022-02-22T17:00:00.000Z' },
  { label: 'Witch Queen', start: '2022-02-22T17:00:00.000Z', end: '2023-02-28T17:00:00.000Z' },
  { label: 'Lightfall', start: '2023-02-28T17:00:00.000Z', end: '2024-06-04T17:00:00.000Z' },
  { label: 'The Final Shape', start: '2024-06-04T17:00:00.000Z', end: '2025-07-15T17:00:00.000Z' },
  { label: 'The Year of Prophecy', start: '2025-07-15T17:00:00.000Z', end: '2026-06-09T17:00:00.000Z' },
];

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
    const start = new Date(period.start);
    const end = new Date(period.end);
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
