const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Credentials from environment variables
const APP_ID = process.env.SEATALK_APP_ID;
const APP_SECRET = process.env.SEATALK_APP_SECRET;
const SIGNING_SECRET = process.env.SEATALK_SIGNING_SECRET;

// Helper: verify SeaTalk signature
function verifySignature(req) {
  const signature = req.headers['signature'];
  if (!signature) return false;
  const bodyStr = JSON.stringify(req.body);
  const hash = crypto.createHmac('sha256', SIGNING_SECRET).update(bodyStr).digest('hex');
  return hash === signature;
}

// Health check
app.get('/healthz', (req, res) => res.send('OK'));

// Function to get access token
async function getAccessToken() {
  const resp = await axios.post('https://openapi.seatalk.io/auth/app_access_token', {
    app_id: APP_ID,
    app_secret: APP_SECRET
  });
  return resp.data.app_access_token;
}

// Function to send text message to a group
async function sendTextToGroup(groupId, text) {
  try {
    const token = await getAccessToken();
    const messageBody = {
      group_id: groupId,
      message: {
        tag: 'text',
        text: { format: 2, content: text }
      }
    };
    await axios.post('https://openapi.seatalk.io/messaging/v2/group_chat',
      messageBody,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    console.error('Error sending group message:', err.response?.data || err.message);
  }
}

// Function to send text message to 1-on-1 bot user
async function sendTextToUser(userId, text) {
  try {
    const token = await getAccessToken();
    const messageBody = {
      bot_user_id: userId,
      message: {
        tag: 'text',
        text: { format: 2, content: text }
      }
    };
    await axios.post('https://openapi.seatalk.io/messaging/v2/bot_chat',
      messageBody,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    console.error('Error sending 1-on-1 message:', err.response?.data || err.message);
  }
}

// Webhook endpoint
app.post('/callback', async (req, res) => {
  try {
    const body = req.body;

    // 1️⃣ Respond to SeaTalk verification challenge
    if (body.event && body.event.seatalk_challenge) {
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

    // 4️⃣ Message received from bot subscriber (1-on-1)
    else if (eventType === 'message_from_bot_subscriber') {
      const userId = event.seatalk_id;
      const message = event.message;
      const text = message?.text?.content?.trim();

      if (text === '/hello') {
        await sendTextToUser(userId, 'Hello! 👋 How can I help you today?');
      }
    }

    // 5️⃣ Message received from group (mentioned bot)
    else if (eventType === 'new_mentioned_message_received_from_group_chat') {
      const groupId = event.group.group_id;
      const content = event.message.text?.content?.trim();
      if (content === '/hello') {
        await sendTextToGroup(groupId, 'Hello everyone! 👋');
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

// Keep process alive log
setInterval(() => console.log('Bot still running...'), 30000);
