// Needs --allow-env (sets ALERT_EMAIL_DAILY_CAP).
import { assertEquals } from 'jsr:@std/assert@1';
import {
  alertEmailDailyCap,
  countEmailsSent,
  DEFAULT_ALERT_EMAIL_DAILY_CAP,
  utcDayStart,
} from './emailBudget.ts';

Deno.test('countEmailsSent: one email per user + timestamp, however many alerts', () => {
  const t1 = '2026-10-07T08:00:01.000Z';
  const t2 = '2026-10-07T15:30:00.000Z';
  assertEquals(
    countEmailsSent([
      { user_id: 'a', emailed_at: t1 },
      { user_id: 'a', emailed_at: t1 }, // same email, second alert
      { user_id: 'a', emailed_at: t2 }, // later run
      { user_id: 'b', emailed_at: t1 },
    ]),
    3,
  );
  assertEquals(countEmailsSent([]), 0);
});

Deno.test('utcDayStart: midnight UTC of the same day', () => {
  assertEquals(utcDayStart(new Date('2026-10-07T23:59:59Z')), '2026-10-07T00:00:00.000Z');
});

Deno.test('alertEmailDailyCap: env override, default otherwise', () => {
  Deno.env.delete('ALERT_EMAIL_DAILY_CAP');
  assertEquals(alertEmailDailyCap(), DEFAULT_ALERT_EMAIL_DAILY_CAP);
  Deno.env.set('ALERT_EMAIL_DAILY_CAP', '50');
  assertEquals(alertEmailDailyCap(), 50);
  Deno.env.set('ALERT_EMAIL_DAILY_CAP', 'lots');
  assertEquals(alertEmailDailyCap(), DEFAULT_ALERT_EMAIL_DAILY_CAP);
  Deno.env.delete('ALERT_EMAIL_DAILY_CAP');
});
