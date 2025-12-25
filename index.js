const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Your credentials (set via environment variables)
const APP_ID = process.env.SEATALK_APP_ID;
const APP_SECRET = process.env.SEATALK_APP_SECRET;
const SIGNING_SECRET = process.env.SEATALK_SIGNING_SECRET;

// Helper: verify SeaTalk signature (HMAC-SHA256 of timestamp+body)
function verifySignature(req) {
  const timestamp = req.headers['x-seatalk-timestamp'];
  const signature = req.headers['x-seatalk-signature'];
  if (!timestamp || !signature) return false;
  const bodyStr = JSON.stringify(req.body);
  const hash = crypto.createHmac('sha256', SIGNING_SECRET)
                     .update(timestamp + bodyStr)
                     .digest('hex');
  return (hash === signature);
}

// Webhook endpoint
app.post('/callback', async (req, res) => {
  // Verify request signature (reject if bad or if replay)
  if (!verifySignature(req)) return res.status(401).send('Invalid signature');

  const payload = req.body;
  // Handle URL verification challenge if any
  if (payload.event_type === 'event_verification') {
    return res.json(payload.event); // echo back challenge/token
  }
  // Process incoming message events
  if (payload.event_type === 'message_from_bot_subscriber' || payload.event_type === 'group_message') {
    const event = payload.event;
    const content = event.message.text.content;  // plain text content
    // Detect specifically "hello @Auto Bot!" (case-insensitive)
    if (content && content.toLowerCase().trim() === 'hello @auto bot!') {
      // Prepare reply via SeaTalk API (see next section)
      await sendTextToGroup(event.group_code, `Hello! I am Auto Bot. 👋`);
    }
  }
  return res.sendStatus(200); // Acknowledge receipt
});

async function getAccessToken() {
  const resp = await axios.post('https://openapi.seatalk.io/auth/app_access_token', {
    app_id: APP_ID, app_secret: APP_SECRET
  });
  return resp.data.app_access_token;
}

async function sendTextToGroup(groupId, text) {
  const token = await getAccessToken();
  const messageBody = {
    group_code: groupId,       // the group chat identifier from the event
    message: {
      tag: "text",
      text: { content: text }
    }
  };
  await axios.post('https://openapi.seatalk.io/messaging/v2/group_chat', 
    messageBody,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}
