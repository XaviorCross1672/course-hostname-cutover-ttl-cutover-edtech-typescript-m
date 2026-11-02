import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { cutoverDecision } from './teaching_window.ts';

test('wait for cached answers, protect deadlines, then admit checked courses', () => {
  const now = Date.parse('2030-01-10T10:00:00Z');
  const plan = { preparedAt: '2030-01-10T09:00:00Z', previousTtl: 3600,
    courses: [{ course: 'Biology', deliveryChecked: true, learnerDeadline: '2030-01-11T10:00:00Z' }],
    educatorReportingChecked: true };
  assert.match(cutoverDecision(plan, now - 1), /previous TTL/);
  assert.equal(cutoverDecision(plan, now), 'ready');
  assert.match(cutoverDecision({ ...plan, educatorReportingChecked: false }, now), /reporting/);
  assert.match(cutoverDecision({ ...plan, courses: [{ ...plan.courses[0], learnerDeadline: '2030-01-10T10:20:00Z' }] }, now), /deadline/);
});
