const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ENV
const APP_ID = process.env.SEATALK_APP_ID;
const APP_SECRET = process.env.SEATALK_APP_SECRET;

// Health check
app.get('/healthz', (req, res) => res.send('OK'));

// Get access token
async function getAccessToken() {
  const res = await axios.post(
    'https://openapi.seatalk.io/auth/app_access_token',
    {
      app_id: APP_ID,
      app_secret: APP_SECRET
    }
  );
  return res.data.app_access_token;
}

// Send group message
async function sendGroupMessage(groupId, text) {
  const token = await getAccessToken();
  await axios.post(
    'https://openapi.seatalk.io/messaging/v2/group_chat',
    {
      group_id: groupId,
      message: {
        tag: 'text',
        text: { format: 2, content: text }
      }
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

// Send 1-on-1 message ✅ CORRECT ENDPOINT
async function sendUserMessage(userId, text) {
  const token = await getAccessToken();
  await axios.post(
    'https://openapi.seatalk.io/messaging/v2/bot_chat',
    {
      bot_user_id: userId,
      message: {
        tag: 'text',
        text: { format: 2, content: text }
      }
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

// CALLBACK
app.post('/callback', async (req, res) => {
  const body = req.body;
  console.log('Incoming event:', JSON.stringify(body, null, 2));

  // Verification challenge
  if (body.event?.seatalk_challenge) {
    return res.json({ seatalk_challenge: body.event.seatalk_challenge });
  }

  const eventType = body.event_type;
  const event = body.event;

  // Bot added to group
  if (eventType === 'bot_added_to_group_chat') {
    await sendGroupMessage(
      event.group.group_id,
      '👋 Hello everyone! Bot is online.'
    );
  }

  // 1-on-1 chat
  if (eventType === 'message_from_bot_subscriber') {
    const text = event.message?.text?.content?.trim();
    if (text === '/hello') {
      await sendUserMessage(
        event.seatalk_id,
        'Hello! 👋 This is 1-on-1 reply.'
      );
    }
  }

  // Group chat (bot mentioned)
  if (eventType === 'new_mentioned_message_received_from_group_chat') {
    const text = event.message?.text?.content?.trim();
    if (text === '/hello') {
      await sendGroupMessage(
        event.group.group_id,
        'Hello group! 👋'
      );
    }
  }

  res.sendStatus(200);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('SeaTalk bot running on port', PORT);
});
