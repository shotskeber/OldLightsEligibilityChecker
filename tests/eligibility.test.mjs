import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OLD_LIGHTS_PERIODS,
  buildActivityWindow,
  calculateActivityStats,
  calculateEligibility,
  calculateUiHints,
} from '../src/lib/eligibility.js';

test('buildActivityWindow derives start and end from period, startSeconds, and timePlayedSeconds', () => {
  const window = buildActivityWindow({
    period: '2024-06-04T10:00:00Z',
    values: {
      startSeconds: { basic: { value: 120 } },
      timePlayedSeconds: { basic: { value: 1800 } },
    },
  });

  assert.equal(window.start.toISOString(), '2024-06-04T10:02:00.000Z');
  assert.equal(window.end.toISOString(), '2024-06-04T10:32:00.000Z');
  assert.equal(window.secondsPlayed, 1800);
});

test('calculateEligibility counts playtime on exact period boundaries', () => {
  const result = calculateEligibility([
    {
      start: new Date('2017-09-06T17:00:00.000Z'),
      end: new Date('2017-09-06T17:05:00.000Z'),
      secondsPlayed: 300,
    },
    {
      start: new Date('2026-06-09T16:59:00.000Z'),
      end: new Date('2026-06-09T16:59:30.000Z'),
      secondsPlayed: 30,
    },
  ]);

  assert.equal(result.periods[0].totalSeconds, 300);
  assert.equal(result.periods.at(-1).totalSeconds, 30);
});

test('calculateEligibility aggregates playtime across multiple activities in the same period', () => {
  const result = calculateEligibility([
    {
      start: new Date('2020-11-15T12:00:00.000Z'),
      end: new Date('2020-11-15T12:10:00.000Z'),
      secondsPlayed: 600,
    },
    {
      start: new Date('2021-03-01T01:00:00.000Z'),
      end: new Date('2021-03-01T01:20:00.000Z'),
      secondsPlayed: 1200,
    },
  ]);

  const beyondLight = result.periods.find((period) => period.label === 'Beyond Light');
  assert.ok(beyondLight);
  assert.equal(beyondLight.totalSeconds, 1800);
  assert.equal(beyondLight.formattedPlaytime, '30m');
});

test('calculateEligibility splits playtime across adjacent expansion windows when a session crosses midnight boundary', () => {
  const result = calculateEligibility([
    {
      start: new Date('2024-06-04T16:55:00.000Z'),
      end: new Date('2024-06-04T17:05:00.000Z'),
      secondsPlayed: 600,
    },
  ]);

  const lightfall = result.periods.find((period) => period.label === 'Lightfall');
  const finalShape = result.periods.find((period) => period.label === 'The Final Shape');

  assert.ok(lightfall);
  assert.ok(finalShape);
  assert.equal(lightfall.totalSeconds, 300);
  assert.equal(finalShape.totalSeconds, 300);
});

test('calculateEligibility marks accounts ineligible when any window has zero playtime', () => {
  const activities = OLD_LIGHTS_PERIODS.map((period, index) => ({
    start: new Date(period.start),
    end: new Date(new Date(period.start).getTime() + 5 * 60 * 1000),
    secondsPlayed: index === 3 ? 0 : 300,
  })).filter((activity) => activity.secondsPlayed > 0);

  const result = calculateEligibility(activities);

  assert.equal(result.eligible, false);
  const beyondLight = result.periods.find((period) => period.label === 'Beyond Light');
  assert.ok(beyondLight);
  assert.equal(beyondLight.isEligible, false);
  assert.equal(beyondLight.totalSeconds, 0);
});

test('calculateEligibility marks accounts eligible when all windows have non-zero playtime', () => {
  const activities = OLD_LIGHTS_PERIODS.map((period) => ({
    start: new Date(period.start),
    end: new Date(new Date(period.start).getTime() + 2 * 60 * 1000),
    secondsPlayed: 120,
  }));

  const result = calculateEligibility(activities);

  assert.equal(result.eligible, true);
  assert.ok(result.periods.every((period) => period.isEligible));
});

test('calculateEligibility excludes playtime before a 17:00 UTC expansion boundary', () => {
  const result = calculateEligibility([
    {
      start: new Date('2018-09-04T16:45:00.000Z'),
      end: new Date('2018-09-04T16:55:00.000Z'),
      secondsPlayed: 600,
    },
    {
      start: new Date('2018-09-04T17:05:00.000Z'),
      end: new Date('2018-09-04T17:15:00.000Z'),
      secondsPlayed: 600,
    },
  ]);

  const destiny2 = result.periods.find((period) => period.label === 'Destiny 2');
  const forsaken = result.periods.find((period) => period.label === 'Forsaken');

  assert.ok(destiny2);
  assert.ok(forsaken);
  assert.equal(destiny2.totalSeconds, 600);
  assert.equal(forsaken.totalSeconds, 600);
});

test('calculateActivityStats counts active days within a single expansion timeline', () => {
  const stats = calculateActivityStats([
    {
      start: new Date('2022-03-01T18:00:00.000Z'),
      end: new Date('2022-03-01T18:30:00.000Z'),
      secondsPlayed: 1800,
    },
    {
      start: new Date('2022-03-03T19:00:00.000Z'),
      end: new Date('2022-03-03T19:15:00.000Z'),
      secondsPlayed: 900,
    },
  ]);

  const witchQueen = stats.expansions.find((period) => period.label === 'Witch Queen');

  assert.ok(witchQueen);
  assert.equal(witchQueen.activeDayCount, 2);
  assert.equal(witchQueen.firstActivityDate, '2022-03-01');
  assert.equal(witchQueen.lastActivityDate, '2022-03-03');
});

test('calculateActivityStats splits a session across multiple UTC active days', () => {
  const stats = calculateActivityStats([
    {
      start: new Date('2024-06-10T23:50:00.000Z'),
      end: new Date('2024-06-11T00:10:00.000Z'),
      secondsPlayed: 1200,
    },
  ]);

  const finalShape = stats.expansions.find((period) => period.label === 'The Final Shape');

  assert.ok(finalShape);
  assert.equal(finalShape.activeDayCount, 2);
  assert.equal(finalShape.firstActivityDate, '2024-06-10');
  assert.equal(finalShape.lastActivityDate, '2024-06-11');
});

test('calculateActivityStats reports overall first and last recorded activity with expansions', () => {
  const stats = calculateActivityStats([
    {
      start: new Date('2017-09-06T18:00:00.000Z'),
      end: new Date('2017-09-06T18:05:00.000Z'),
      secondsPlayed: 300,
    },
    {
      start: new Date('2026-05-28T20:00:00.000Z'),
      end: new Date('2026-05-28T20:15:00.000Z'),
      secondsPlayed: 900,
    },
  ]);

  assert.deepEqual(stats.firstRecorded, {
    date: '2017-09-06',
    expansionLabel: 'Destiny 2',
  });
  assert.deepEqual(stats.lastRecorded, {
    date: '2026-05-28',
    expansionLabel: 'The Year of Prophecy',
  });
});

test('calculateActivityStats totals active days across multiple expansion years', () => {
  const stats = calculateActivityStats([
    {
      start: new Date('2018-01-01T19:00:00.000Z'),
      end: new Date('2018-01-01T19:05:00.000Z'),
      secondsPlayed: 300,
    },
    {
      start: new Date('2020-12-01T19:00:00.000Z'),
      end: new Date('2020-12-01T19:05:00.000Z'),
      secondsPlayed: 300,
    },
    {
      start: new Date('2020-12-03T19:00:00.000Z'),
      end: new Date('2020-12-03T19:05:00.000Z'),
      secondsPlayed: 300,
    },
  ]);

  assert.equal(stats.totalActiveDays, 3);
});

test('calculateActivityStats reports the longest streak and its expansion', () => {
  const stats = calculateActivityStats([
    {
      start: new Date('2023-03-01T19:00:00.000Z'),
      end: new Date('2023-03-01T19:10:00.000Z'),
      secondsPlayed: 600,
    },
    {
      start: new Date('2023-03-02T19:00:00.000Z'),
      end: new Date('2023-03-02T19:10:00.000Z'),
      secondsPlayed: 600,
    },
    {
      start: new Date('2023-03-03T19:00:00.000Z'),
      end: new Date('2023-03-03T19:10:00.000Z'),
      secondsPlayed: 600,
    },
    {
      start: new Date('2022-03-01T19:00:00.000Z'),
      end: new Date('2022-03-01T19:10:00.000Z'),
      secondsPlayed: 600,
    },
  ]);

  assert.deepEqual(stats.longestStreak, {
    days: 3,
    expansionLabel: 'Lightfall',
  });
});

test('calculateActivityStats builds a full timeline for each expansion', () => {
  const stats = calculateActivityStats([
    {
      start: new Date('2025-07-15T18:00:00.000Z'),
      end: new Date('2025-07-15T18:05:00.000Z'),
      secondsPlayed: 300,
    },
  ]);

  const yearOfProphecy = stats.expansions.find((period) => period.label === 'The Year of Prophecy');

  assert.ok(yearOfProphecy);
  assert.ok(yearOfProphecy.timelineDays.length > 300);
  assert.equal(yearOfProphecy.timelineDays[0], true);
});

test('calculateUiHints only marks final-expansion-only misses as almost there before cutoff', () => {
  const uiHints = calculateUiHints(
    OLD_LIGHTS_PERIODS.map((period) => ({
      ...period,
      isEligible: period.label !== 'The Year of Prophecy',
    })),
    new Date('2026-06-08T20:00:00.000Z')
  );

  assert.equal(uiHints.almostThere, true);
});

test('calculateUiHints does not mark earlier missing periods as almost there', () => {
  const uiHints = calculateUiHints(
    OLD_LIGHTS_PERIODS.map((period) => ({
      ...period,
      isEligible: !['Lightfall', 'The Year of Prophecy'].includes(period.label),
    })),
    new Date('2026-06-08T20:00:00.000Z')
  );

  assert.equal(uiHints.almostThere, false);
});

test('calculateUiHints does not mark fully eligible accounts as almost there', () => {
  const uiHints = calculateUiHints(
    OLD_LIGHTS_PERIODS.map((period) => ({
      ...period,
      isEligible: true,
    })),
    new Date('2026-06-08T20:00:00.000Z')
  );

  assert.equal(uiHints.almostThere, false);
});

test('calculateUiHints stops almost-there messaging at the cutoff', () => {
  const uiHints = calculateUiHints(
    OLD_LIGHTS_PERIODS.map((period) => ({
      ...period,
      isEligible: period.label !== 'The Year of Prophecy',
    })),
    new Date('2026-06-09T17:00:00.000Z')
  );

  assert.equal(uiHints.almostThere, false);
});
