// index.js
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ---- CONFIG ----
const APP_ID = process.env.SEATALK_APP_ID;
const APP_SECRET = process.env.SEATALK_APP_SECRET;
const SIGNING_SECRET = process.env.SEATALK_SIGNING_SECRET;

// ---- HELPER: Verify SeaTalk signature ----
function verifySignature(bodyStr, signature) {
  const hash = crypto.createHmac('sha256', SIGNING_SECRET)
                     .update(bodyStr)
                     .digest('hex');
  return hash === signature;
}

// ---- Health check for Render ----
app.get('/healthz', (req, res) => res.send('OK'));

// ---- Webhook endpoint ----
app.post('/callback', async (req, res) => {
  try {
    console.log('Received event:', JSON.stringify(req.body, null, 2));

    // 1️⃣ Handle verification challenge
    if (req.body.event_type === 'event_verification') {
      const challenge = req.body.event.seatalk_challenge;
      console.log('Verification challenge received:', challenge);
      return res.json({ seatalk_challenge: challenge });
    }

    // 2️⃣ Verify signature for normal events
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['signature'];
    if (!verifySignature(rawBody, signature)) {
      console.log('Invalid signature!');
      return res.status(401).send('Invalid signature');
    }

    const eventType = req.body.event_type;
    const event = req.body.event;

    // 3️⃣ Bot added to group -> send greeting
    if (eventType === 'bot_added_to_group_chat') {
      const groupId = event.group.group_id;
      const groupName = event.group.group_name;
      console.log(`Bot added to group: ${groupName} (${groupId})`);

      await sendTextToGroup(groupId, `Hello everyone! 👋 I am TEST123, glad to join ${groupName}!`);
    }

    // 4️⃣ Respond to /hello in group (no mention needed)
    if (eventType === 'new_mentioned_message_received_from_group_chat' ||
        eventType === 'message_received_from_group') {
      const groupId = event.group.group_id;
      const content = event.message.text?.content?.trim().toLowerCase();
      console.log(`Message received in group ${groupId}: ${content}`);

      if (content === '/hello') {
        await sendTextToGroup(groupId, `Hello! 👋 This is TEST123 responding to your command.`);
      }
    }

    // 5️⃣ Respond 200 OK to SeaTalk
    res.sendStatus(200);

  } catch (err) {
    console.error('Error processing webhook:', err);
    res.sendStatus(500);
  }
});

// ---- Get App Access Token ----
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

// ---- Send message to a group ----
async function sendTextToGroup(groupId, text) {
  try {
    const token = await getAccessToken();
    const messageBody = {
      group_id: groupId,
      message: {
        tag: 'text',
        text: { format: 1, content: text }
      }
    };

    const resp = await axios.post('https://openapi.seatalk.io/messaging/v2/group_chat',
      messageBody,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('Message sent successfully:', resp.data);
  } catch (err) {
    console.error('Error sending message:', err.response?.data || err.message);
  }
}

// ---- Listen on Render's PORT ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Seatalk bot running on port ${PORT}`));
