// index.js
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();

// Capture raw body for signature verification
app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// Load secrets from Render env
const APP_ID = process.env.SEATALK_APP_ID;
const APP_SECRET = process.env.SEATALK_APP_SECRET;
const SIGNING_SECRET = process.env.SEATALK_SIGNING_SECRET;

// Verify SeaTalk signature using raw body + signing secret
function verifySignature(rawBody, signature) {
  const hash = crypto.createHash('sha256')
                     .update(Buffer.concat([rawBody, Buffer.from(SIGNING_SECRET)]))
                     .digest('hex');
  return hash === signature;
}

// Health check for Render
app.get('/healthz', (req, res) => res.send('OK'));

// Main callback endpoint
app.post('/callback', async (req, res) => {
  try {
    const rawBody = req.rawBody;
    const signature = req.headers['signature'];

    console.log('Received event raw:', req.body);

    // Handle verification handshake
    if (req.body.event_type === 'event_verification') {
      const challenge = req.body.event.seatalk_challenge;
      console.log('Verification challenge:', challenge);
      return res.json({ seatalk_challenge: challenge });
    }

    if (!verifySignature(rawBody, signature)) {
      console.log('Signature failed:', signature);
      return res.status(401).send('Invalid signature');
    }

    const { event_type, event } = req.body;

    // Bot added to group
    if (event_type === 'bot_added_to_group_chat') {
      const groupId = event.group.group_id;
      const groupName = event.group.group_name;
      console.log(`Bot added to group ${groupName}`);
      await sendTextToGroup(groupId, `👋 Hello everyone! I am TEST123, happy to join ${groupName}!`);
    }

    // Any text message in group
    if (event_type === 'message_received_from_group') {
      const text = event.message.text?.content?.trim().toLowerCase();
      const groupId = event.group.group_id;
      console.log(`Group message:`, text);

      if (text === '/hello') {
        await sendTextToGroup(groupId, `👋 Hi there! TEST123 is here!`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Callback error:', err);
    res.sendStatus(500);
  }
});

// Get access token to call SeaTalk APIs
async function getAccessToken() {
  const resp = await axios.post('https://openapi.seatalk.io/auth/app_access_token', {
    app_id: APP_ID,
    app_secret: APP_SECRET
  });
  return resp.data.app_access_token;
}

// Send text to a group
async function sendTextToGroup(groupId, text) {
  try {
    const token = await getAccessToken();
    const body = {
      group_id: groupId,
      message: {
        tag: 'text',
        text: { format: 1, content: text }
      }
    };
    await axios.post('https://openapi.seatalk.io/messaging/v2/group_chat', body, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Sent message to group:', groupId);
  } catch (err) {
    console.error('Send failed:', err.response?.data || err.message);
  }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot is running on port ${PORT}`));
