const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Credentials from environment
const APP_ID = process.env.SEATALK_APP_ID;
const APP_SECRET = process.env.SEATALK_APP_SECRET;
const SIGNING_SECRET = process.env.SEATALK_SIGNING_SECRET;

// -----------------------------
// Signature verification fix
// SeaTalk: hash of JSON(body) + signing_secret, using SHA-256
function verifySignature(req) {
  const signature = req.headers['signature'];
  if (!signature) return false;
  const bodyStr = JSON.stringify(req.body);
  const hash = crypto.createHash('sha256').update(bodyStr + SIGNING_SECRET).digest('hex');
  return hash === signature;
}

// Health check
app.get('/healthz', (req, res) => res.send('OK'));

// -----------------------------
// Get App Access Token
async function getAccessToken() {
  try {
    const resp = await axios.post('https://openapi.seatalk.io/auth/app_access_token', {
      app_id: APP_ID,
      app_secret: APP_SECRET
    });
    return resp.data.app_access_token;
  } catch (err) {
    console.error('Error getting access token:', err.response?.data || err.message);
    throw err;
  }
}

// -----------------------------
// Send text to group
async function sendTextToGroup(groupId, text) {
  const token = await getAccessToken();
  const body = {
    group_id: groupId,
    message: {
      tag: 'text',
      text: { format: 2, content: text }
    }
  };
  await axios.post('https://openapi.seatalk.io/messaging/v2/group_chat', body, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// Send text to 1-on-1 bot user
async function sendTextToUser(userId, text) {
  const token = await getAccessToken();
  const body = {
    bot_user_id: userId,
    message: {
      tag: 'text',
      text: { format: 2, content: text }
    }
  };
  await axios.post('https://openapi.seatalk.io/messaging/v2/bot_chat', body, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// -----------------------------
// Webhook endpoint
app.post('/callback', async (req, res) => {
  try {
    const body = req.body;

    // 1️⃣ Verification challenge
    if (body.event?.seatalk_challenge) {
      console.log('Verification challenge:', body.event.seatalk_challenge);
      return res.status(200).json({ seatalk_challenge: body.event.seatalk_challenge });
    }

    // 2️⃣ Verify signature
    if (!verifySignature(req)) {
      console.log('Invalid signature!');
      return res.status(401).send('Invalid signature');
    }

    const eventType = body.event_type;
    const event = body.event;

    // 3️⃣ Bot added to group chat
    if (eventType === 'bot_added_to_group_chat') {
      const groupId = event.group.group_id;
      await sendTextToGroup(groupId, `Hello everyone! I am your new bot 🤖`);
      console.log(`Sent greeting to group ${groupId}`);
    }

    // 4️⃣ 1-on-1 message
    else if (eventType === 'message_from_bot_subscriber') {
      const userId = event.seatalk_id;
      const text = event.message?.text?.content?.trim();
      if (text === '/hello') {
        await sendTextToUser(userId, 'Hello! 👋 How can I help you today?');
        console.log(`Responded to /hello in 1-on-1 for ${userId}`);
      }
    }

    // 5️⃣ Group chat mention
    else if (eventType === 'new_mentioned_message_received_from_group_chat') {
      const groupId = event.group.group_id;
      const text = event.message?.text?.content?.trim();
      if (text === '/hello') {
        await sendTextToGroup(groupId, 'Hello everyone! 👋');
        console.log(`Responded to /hello in group ${groupId}`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(500);
  }
});

// -----------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Seatalk bot running on port ${PORT}`));
setInterval(() => console.log('Bot still running...'), 30000);
