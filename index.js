const axios = require('axios');

const BOT_URL = 'https://seatalk-bot-vgi4.onrender.com/callback'; // Your deployed bot URL
const SIGNING_SECRET = 'FCSaY6KX1inVlykIMlW-H_dGnevTLZ_y'; // Your signing secret
const crypto = require('crypto');

function generateSignature(body) {
  const timestamp = Date.now().toString();
  const hash = crypto.createHmac('sha256', SIGNING_SECRET)
                     .update(Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]))
                     .digest('hex');
  return { signature: hash, timestamp };
}

async function simulate1on1Message() {
  const payload = {
    event_id: 'test-1on1-001',
    event_type: 'message_from_bot_subscriber',
    timestamp: Date.now(),
    app_id: 'NTQxNjAyNTQ1OTg4',
    event: {
      seatalk_id: 'TEST_USER_1',
      employee_code: 'e_test123',
      email: 'user@test.com',
      message: {
        message_id: 'msg-001',
        tag: 'text',
        text: { content: '/hello' }
      }
    }
  };

  const body = JSON.stringify(payload);
  const { signature, timestamp } = generateSignature(body);

  const resp = await axios.post(BOT_URL, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Seatalk-Timestamp': timestamp,
      'X-Seatalk-Signature': signature
    }
  });
  console.log('1-on-1 test response status:', resp.status);
}

async function simulateGroupMessage() {
  const payload = {
    event_id: 'test-group-001',
    event_type: 'new_mentioned_message_received_from_group_chat',
    timestamp: Date.now(),
    app_id: 'NTQxNjAyNTQ1OTg4',
    event: {
      group: { group_id: 'NTk0MzI5MTY4NzE2', group_name: 'Test Group' },
      message: {
        message_id: 'msg-002',
        tag: 'text',
        text: { content: '/hello' }
      },
      seatalk_id: 'TEST_USER_2'
    }
  };

  const body = JSON.stringify(payload);
  const { signature, timestamp } = generateSignature(body);

  const resp = await axios.post(BOT_URL, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Seatalk-Timestamp': timestamp,
      'X-Seatalk-Signature': signature
    }
  });
  console.log('Group chat test response status:', resp.status);
}

(async () => {
  console.log('--- Simulating 1-on-1 message ---');
  await simulate1on1Message();
  console.log('--- Simulating group message ---');
  await simulateGroupMessage();
})();
