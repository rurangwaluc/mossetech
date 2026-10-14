import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MOSSE_TECH_OTP_SENDER,
  sendOtpEmail,
} from './resend-otp-email.ts';

const input = {
  email: ' STAFF@EXAMPLE.COM ',
  code: '005128',
  challengeId:
    '21f3489b-e190-42b7-a9f3-15e563a9c3a9',
};

const options = {
  apiKey: 're_testing_only',
  from: MOSSE_TECH_OTP_SENDER,
};

test(
  'sends a valid OTP with safe headers and idempotency',
  async () => {
    let calls = 0;

    const result = await sendOtpEmail(input, {
      ...options,
      transport: async (url, init) => {
        calls += 1;

        assert.equal(
          url,
          'https://api.resend.com/emails',
        );

        assert.equal(init.method, 'POST');

        assert.equal(
          init.headers['Idempotency-Key'],
          `mossetech-otp/${input.challengeId}`,
        );

        assert.equal(
          init.headers.Authorization,
          'Bearer re_testing_only',
        );

        const data = JSON.parse(init.body);

        assert.deepEqual(
          data.to,
          ['staff@example.com'],
        );

        assert.equal(
          data.from,
          MOSSE_TECH_OTP_SENDER,
        );

        assert.match(
          data.text,
          /005128/,
        );

        assert.match(
          data.html,
          /005128/,
        );

        assert.equal(
          data.html.includes('re_testing_only'),
          false,
        );

        return new Response(
          JSON.stringify({
            id: 'email-test-id',
          }),
          { status: 200 },
        );
      },
    });

    assert.equal(
      result.providerMessageId,
      'email-test-id',
    );

    assert.equal(calls, 1);
  },
);

test(
  'rejects invalid requests before sending',
  async () => {
    const noSend = async () => {
      throw new Error(
        'Unexpected network call',
      );
    };

    for (const bad of [
      {
        ...input,
        code: 'abc123',
      },
      {
        ...input,
        email: 'bad\naddress@example.com',
      },
      {
        ...input,
        challengeId: 'invalid',
      },
    ]) {
      await assert.rejects(
        sendOtpEmail(bad, {
          ...options,
          transport: noSend,
        }),
        /Invalid verification email request/,
      );
    }
  },
);

test(
  'rejects an incorrect sender or invalid key',
  async () => {
    await assert.rejects(
      sendOtpEmail(input, {
        ...options,
        from: 'Imposter <bad@example.com>',
      }),
      /not configured/,
    );

    await assert.rejects(
      sendOtpEmail(input, {
        ...options,
        apiKey: 'invalid',
      }),
      /not configured/,
    );
  },
);

test(
  'provider errors never expose codes or API keys',
  async () => {
    const transports = [
      async () =>
        new Response(
          're_testing_only 005128',
          { status: 429 },
        ),

      async () => {
        throw new Error(
          're_testing_only 005128',
        );
      },
    ];

    for (const transport of transports) {
      await assert.rejects(
        sendOtpEmail(input, {
          ...options,
          transport,
        }),
        (error) =>
          !error.message.includes('005128') &&
          !error.message.includes(
            're_testing_only',
          ),
      );
    }
  },
);

test(
  'rejects malformed provider success responses',
  async () => {
    await assert.rejects(
      sendOtpEmail(input, {
        ...options,
        transport: async () =>
          new Response(
            'not-json',
            { status: 200 },
          ),
      }),
      /could not be delivered/,
    );

    await assert.rejects(
      sendOtpEmail(input, {
        ...options,
        transport: async () =>
          new Response(
            '{}',
            { status: 200 },
          ),
      }),
      /could not be delivered/,
    );
  },
);
