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
const DAY_MS = 24 * 60 * 60 * 1000;
const FINAL_EXPANSION_LABEL = 'The Year of Prophecy';

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

function getOverlappingRange(activity, periodStart, periodEnd) {
  const overlapStart = Math.max(activity.start.getTime(), periodStart.getTime());
  const overlapEnd = Math.min(activity.end.getTime(), periodEnd.getTime());

  if (overlapEnd <= overlapStart) {
    return null;
  }

  return {
    start: new Date(overlapStart),
    end: new Date(overlapEnd),
  };
}

function getUtcDayStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function getDayKey(date) {
  return getUtcDayStart(date).toISOString().slice(0, 10);
}

function buildDayKeysBetween(start, endExclusive) {
  if (endExclusive.getTime() <= start.getTime()) {
    return [];
  }

  const keys = [];
  let cursor = getUtcDayStart(start);
  const finalDay = getUtcDayStart(new Date(endExclusive.getTime() - 1));

  while (cursor.getTime() <= finalDay.getTime()) {
    keys.push(getDayKey(cursor));
    cursor = addUtcDays(cursor, 1);
  }

  return keys;
}

function getDayActivityMap(activities, periodStart, periodEnd) {
  const activeDayKeys = new Set();

  for (const activity of activities) {
    const overlap = getOverlappingRange(activity, periodStart, periodEnd);
    if (!overlap) {
      continue;
    }

    for (const dayKey of buildDayKeysBetween(overlap.start, overlap.end)) {
      activeDayKeys.add(dayKey);
    }
  }

  return activeDayKeys;
}

function getLongestStreakForTimeline(timelineDays) {
  let best = { days: 0, endIndex: -1 };
  let currentDays = 0;

  timelineDays.forEach((isActive, index) => {
    if (isActive) {
      currentDays += 1;
      if (currentDays > best.days) {
        best = { days: currentDays, endIndex: index };
      }
      return;
    }

    currentDays = 0;
  });

  return best;
}

function getTimelineEntry(period, activities) {
  const periodStart = new Date(period.start);
  const periodEnd = new Date(period.end);
  const dayKeys = buildDayKeysBetween(periodStart, periodEnd);
  const activeDayKeys = getDayActivityMap(activities, periodStart, periodEnd);
  const timelineDays = dayKeys.map((dayKey) => activeDayKeys.has(dayKey));
  const firstActivityDate = dayKeys.find((dayKey) => activeDayKeys.has(dayKey)) ?? null;
  const lastActivityDate = [...dayKeys].reverse().find((dayKey) => activeDayKeys.has(dayKey)) ?? null;
  const longestStreak = getLongestStreakForTimeline(timelineDays);

  return {
    label: period.label,
    start: period.start,
    end: period.end,
    activeDayCount: activeDayKeys.size,
    firstActivityDate,
    lastActivityDate,
    timelineDays,
    longestStreakDays: longestStreak.days,
  };
}

export function calculateActivityStats(activities) {
  const expansions = OLD_LIGHTS_PERIODS.map((period) => getTimelineEntry(period, activities));
  const activeExpansions = expansions.filter((expansion) => expansion.activeDayCount > 0);

  if (!activeExpansions.length) {
    return {
      available: false,
      firstRecorded: null,
      lastRecorded: null,
      totalActiveDays: 0,
      longestStreak: null,
      expansions,
    };
  }

  const firstRecordedExpansion = activeExpansions[0];
  const lastRecordedExpansion = activeExpansions.at(-1);
  const longestStreakExpansion = activeExpansions.reduce((best, expansion) => {
    if (!best || expansion.longestStreakDays > best.longestStreakDays) {
      return expansion;
    }

    return best;
  }, null);

  return {
    available: true,
    firstRecorded: {
      date: firstRecordedExpansion.firstActivityDate,
      expansionLabel: firstRecordedExpansion.label,
    },
    lastRecorded: {
      date: lastRecordedExpansion.lastActivityDate,
      expansionLabel: lastRecordedExpansion.label,
    },
    totalActiveDays: expansions.reduce((sum, expansion) => sum + expansion.activeDayCount, 0),
    longestStreak: longestStreakExpansion
      ? {
          days: longestStreakExpansion.longestStreakDays,
          expansionLabel: longestStreakExpansion.label,
        }
      : null,
    expansions,
  };
}

export function calculateUiHints(periods, now = new Date()) {
  const finalPeriod = periods.find((period) => period.label === FINAL_EXPANSION_LABEL);
  if (!finalPeriod) {
    return { almostThere: false };
  }

  const finalCutoff = new Date(finalPeriod.end);
  const missingPeriods = periods.filter((period) => !period.isEligible);
  const almostThere =
    now.getTime() < finalCutoff.getTime() &&
    missingPeriods.length === 1 &&
    missingPeriods[0].label === FINAL_EXPANSION_LABEL &&
    periods.every((period) => period.label === FINAL_EXPANSION_LABEL || period.isEligible);

  return { almostThere };
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
