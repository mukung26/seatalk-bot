const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Environment variables
const APP_ID = process.env.SEATALK_APP_ID;
const APP_SECRET = process.env.SEATALK_APP_SECRET;
const SIGNING_SECRET = process.env.SEATALK_SIGNING_SECRET;

// --- Helper: verify SeaTalk signature ---
function verifySignature(req) {
  const timestamp = req.headers['x-seatalk-timestamp'];
  const signature = req.headers['x-seatalk-signature'];
  if (!timestamp || !signature) return false;
  const bodyStr = JSON.stringify(req.body);
  const hash = crypto.createHmac('sha256', SIGNING_SECRET)
                     .update(timestamp + bodyStr)
                     .digest('hex');
  return hash === signature;
}

// --- Health check ---
app.get('/healthz', (req, res) => res.send('OK'));

// --- Webhook endpoint ---
app.post('/callback', async (req, res) => {
  try {
    const payload = req.body;
    const event_type = payload.event_type;

    // --- SeaTalk verification ---
    if (event_type === 'event_verification') {
      console.log('Verification challenge:', payload.event.seatalk_challenge);
      return res.json({ seatalk_challenge: payload.event.seatalk_challenge });
    }

    // --- Verify signature for normal events ---
    if (!verifySignature(req)) {
      console.log('Invalid signature!');
      return res.status(401).send('Invalid signature');
    }

    // --- Bot added to group greeting ---
    if (event_type === 'bot_added_to_group_chat') {
      const groupId = payload.event.group.group_id;
      await sendTextToGroup(groupId, 'Hello everyone! 👋 I am your bot.');
      return res.sendStatus(200);
    }

    // --- 1-on-1 chat ---
    if (event_type === 'message_from_bot_subscriber') {
      const message = payload.event.message;
      const content = message.text?.content?.trim();
      if (content === '/hello') {
        const seatalkId = payload.event.seatalk_id;
        await sendTextToBotUser(seatalkId, 'Hello! 👋');
      }
      return res.sendStatus(200);
    }

    // --- Group chat ---
    if (event_type === 'new_mentioned_message_received_from_group_chat' || event_type === 'group_message') {
      const message = payload.event.message;
      const content = message.text?.content?.trim();
      const groupId = payload.event.group_code || payload.event.group?.group_id;

      if (content === '/hello') {
        await sendTextToGroup(groupId, 'Hello everyone! 👋');
      }
      return res.sendStatus(200);
    }

    res.sendStatus(200);

  } catch (err) {
    console.error('Error processing webhook:', err);
    res.sendStatus(500);
  }
});

// --- Function to get app access token ---
async function getAccessToken() {
  const resp = await axios.post('https://openapi.seatalk.io/auth/app_access_token', {
    app_id: APP_ID,
    app_secret: APP_SECRET
  });
  return resp.data.app_access_token;
}

// --- Function to send message to a group ---
async function sendTextToGroup(groupId, text) {
  try {
    const token = await getAccessToken();
    const messageBody = {
      group_id: groupId,
      message: {
        tag: 'text',
        text: { content: text }
      }
    };
    await axios.post(
      'https://openapi.seatalk.io/messaging/v2/group_chat',
      messageBody,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    console.error('Error sending message to group:', err);
  }
}

// --- Function to send message to a bot user (1-on-1) ---
async function sendTextToBotUser(seatalkId, text) {
  try {
    const token = await getAccessToken();
    const messageBody = {
      user_id: seatalkId,
      message: {
        tag: 'text',
        text: { content: text }
      }
    };
    await axios.post(
      'https://openapi.seatalk.io/messaging/v2/bot_user_chat',
      messageBody,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    console.error('Error sending 1-on-1 message:', err);
  }
}

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Seatalk bot running on port ${PORT}`));
