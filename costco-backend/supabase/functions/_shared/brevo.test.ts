// Stubs global fetch — no network. Needs --allow-env.
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import { sendBrevoEmail, sendBrevoSms } from './brevo.ts';

type Call = { url: string; init: RequestInit };

function stubFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Promise.resolve(respond());
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

// Brevo logs on failure paths by design; keep test output clean.
function quietConsole<T>(fn: () => Promise<T>): Promise<T> {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  return fn().finally(() => {
    console.warn = warn;
    console.error = error;
  });
}

const email = {
  to: 'user@example.com',
  subject: 'S',
  html: '<p>H</p>',
  text: 'T',
  tags: ['price-drop'],
};

function withKey(fn: () => Promise<void>) {
  return async () => {
    Deno.env.set('BREVO_API_KEY', 'test-key');
    try {
      await fn();
    } finally {
      Deno.env.delete('BREVO_API_KEY');
    }
  };
}

Deno.test('email without BREVO_API_KEY is skipped, not sent', async () => {
  Deno.env.delete('BREVO_API_KEY');
  const f = stubFetch(() => new Response('{}'));
  try {
    assertFalse(await quietConsole(() => sendBrevoEmail(email)));
    assertEquals(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

Deno.test(
  'email posts the expected payload with the default sender',
  withKey(async () => {
    const f = stubFetch(() => new Response('{"messageId":"1"}', { status: 201 }));
    try {
      assert(await sendBrevoEmail(email));
      assertEquals(f.calls.length, 1);
      assertEquals(f.calls[0].url, 'https://api.brevo.com/v3/smtp/email');
      assertEquals((f.calls[0].init.headers as Record<string, string>)['api-key'], 'test-key');
      const body = JSON.parse(String(f.calls[0].init.body));
      assertEquals(body.sender, { email: 'noreply@everyday-labs.org', name: 'Bulkmate' });
      assertEquals(body.to, [{ email: 'user@example.com' }]);
      assertEquals(body.htmlContent, '<p>H</p>');
      assertEquals(body.textContent, 'T');
      assertEquals(body.tags, ['price-drop']);
    } finally {
      f.restore();
    }
  }),
);

Deno.test(
  'email returns false (never throws) on HTTP error or network failure',
  withKey(async () => {
    let f = stubFetch(() => new Response('bad', { status: 400 }));
    try {
      assertFalse(await quietConsole(() => sendBrevoEmail(email)));
    } finally {
      f.restore();
    }

    f = stubFetch(() => {
      throw new Error('network down');
    });
    try {
      assertFalse(await quietConsole(() => sendBrevoEmail(email)));
    } finally {
      f.restore();
    }
  }),
);

Deno.test(
  'SMS strips the + from E.164 numbers',
  withKey(async () => {
    const f = stubFetch(() => new Response('{}', { status: 201 }));
    try {
      assert(await sendBrevoSms('+15551234567', 'hello', 'weekly'));
      assertEquals(f.calls[0].url, 'https://api.brevo.com/v3/transactionalSMS/send');
      const body = JSON.parse(String(f.calls[0].init.body));
      assertEquals(body.recipient, '15551234567');
      assertEquals(body.content, 'hello');
      assertEquals(body.tag, 'weekly');
    } finally {
      f.restore();
    }
  }),
);
