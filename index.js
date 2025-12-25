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

// Verify SeaTalk signature
function verifySignature(req) {
  const signature = req.headers['signature'];
  if (!signature) return false;
  const bodyStr = JSON.stringify(req.body);
  const hash = crypto.createHmac('sha256', SIGNING_SECRET).update(bodyStr).digest('hex');
  return hash === signature;
}

// Health check
app.get('/healthz', (req, res) => res.send('OK'));

// Get access token
async function getAccessToken() {
  const resp = await axios.post('https://openapi.seatalk.io/auth/app_access_token', {
    app_id: APP_ID,
    app_secret: APP_SECRET
  });
  return resp.data.app_access_token;
}

// Send text to group
async function sendTextToGroup(groupId, text) {
  try {
    const token = await getAccessToken();
    const body = {
      group_id: groupId,
      message: { tag: 'text', text: { format: 2, content: text } }
    };
    await axios.post('https://openapi.seatalk.io/messaging/v2/group_chat', body, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (err) {
    console.error('Error sending group message:', err.response?.data || err.message);
  }
}

// Send text to 1-on-1 subscriber
async function sendTextToUser(userId, text) {
  try {
    const token = await getAccessToken();
    const body = {
      bot_user_id: userId,
      message: { tag: 'text', text: { format: 2, content: text } }
    };
    await axios.post('https://openapi.seatalk.io/messaging/v2/bot/subscriber_chat', body, { // ✅ fixed endpoint
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (err) {
    console.error('Error sending 1-on-1 message:', err.response?.data || err.message);
  }
}

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
      await sendTextToGroup(groupId, 'Hello everyone! I am your new bot 🤖');
      console.log(`Sent greeting to group ${groupId}`);
    }

    // 4️⃣ Message from 1-on-1 bot subscriber
    else if (eventType === 'message_from_bot_subscriber') {
      const userId = event.seatalk_id;
      const text = event.message?.text?.content?.trim();
      if (text === '/hello') {
        await sendTextToUser(userId, 'Hello! 👋 How can I help you today?');
        console.log(`Responded to 1-on-1 /hello from ${userId}`);
      }
    }

    // 5️⃣ Message in group chat mentioning bot
    else if (eventType === 'new_mentioned_message_received_from_group_chat') {
      const groupId = event.group.group_id;
      const text = event.message?.text?.content?.trim();
      if (text === '/hello') {
        await sendTextToGroup(groupId, 'Hello everyone! 👋');
        console.log(`Responded to group /hello in ${groupId}`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(500);
  }
});

// Listen on Render's PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Seatalk bot running on port ${PORT}`));

// Keep alive log
setInterval(() => console.log('Bot still running...'), 30000);
