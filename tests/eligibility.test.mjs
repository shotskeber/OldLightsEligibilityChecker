import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OLD_LIGHTS_PERIODS,
  buildActivityWindow,
  calculateEligibility,
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
      start: new Date('2017-09-06T00:00:00.000Z'),
      end: new Date('2017-09-06T00:05:00.000Z'),
      secondsPlayed: 300,
    },
    {
      start: new Date('2026-06-08T23:59:00.000Z'),
      end: new Date('2026-06-08T23:59:30.000Z'),
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
      start: new Date('2024-06-03T23:55:00.000Z'),
      end: new Date('2024-06-04T00:05:00.000Z'),
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
    start: new Date(`${period.start}T00:00:00.000Z`),
    end: new Date(`${period.start}T00:05:00.000Z`),
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
    start: new Date(`${period.start}T00:00:00.000Z`),
    end: new Date(`${period.start}T00:02:00.000Z`),
    secondsPlayed: 120,
  }));

  const result = calculateEligibility(activities);

  assert.equal(result.eligible, true);
  assert.ok(result.periods.every((period) => period.isEligible));
});
