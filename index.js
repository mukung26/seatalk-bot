const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json()); // built-in parser

// ENV
const APP_ID = process.env.SEATALK_APP_ID;
const APP_SECRET = process.env.SEATALK_APP_SECRET;

// Health check
app.get('/healthz', (req, res) => res.send('OK'));

// Get access token
async function getAccessToken() {
  const res = await axios.post('https://openapi.seatalk.io/auth/app_access_token', {
    app_id: APP_ID,
    app_secret: APP_SECRET
  });
  return res.data.app_access_token;
}

// Send group message
async function sendGroupMessage(groupId, text) {
  const token = await getAccessToken();
  try {
    const res = await axios.post(
      'https://openapi.seatalk.io/messaging/v2/group_chat',
      {
        group_id: groupId,
        message: { tag: 'text', text: { format: 2, content: text } }
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('sendGroupMessage success:', res.data);
  } catch (err) {
    console.error('sendGroupMessage error:', err?.response?.status, err?.response?.data || err.message);
  }
}

// Robust send 1-on-1 message
async function sendUserMessage(userId, text) {
  if (!userId) {
    console.warn('sendUserMessage: missing userId');
    return;
  }
  const token = await getAccessToken();
  const url = 'https://openapi.seatalk.io/messaging/v2/bot_chat';
  const headers = { Authorization: `Bearer ${token}` };

  const payloads = [
    { bot_user_id: userId, message: { tag: 'text', text: { format: 2, content: text } } },
    { user_id: userId, message: { tag: 'text', text: { format: 2, content: text } } },
    { seatalk_id: userId, message: { tag: 'text', text: { format: 2, content: text } } }
  ];

  for (const payload of payloads) {
    try {
      console.log('Trying sendUserMessage with keys:', Object.keys(payload));
      const res = await axios.post(url, payload, { headers });
      console.log('sendUserMessage success:', res.data);
      return;
    } catch (err) {
      console.error('sendUserMessage failed:', err?.response?.status, err?.response?.data || err.message);
    }
  }
}

// Normalize text
function normalizeText(raw) {
  if (!raw) return '';
  return raw.replace(/<at[^>]*>.*?<\/at>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/@\S+/g, '')
            .trim()
            .toLowerCase();
}

// CALLBACK
app.post('/callback', (req, res) => {
  const body = req.body;
  console.log('Incoming payload (raw):', JSON.stringify(body, null, 2));

  // verification challenge
  if (body.seatalk_challenge || body.event?.seatalk_challenge) {
    return res.json({ seatalk_challenge: body.seatalk_challenge || body.event.seatalk_challenge });
  }

  res.sendStatus(200); // ack quickly

  (async () => {
    try {
      const eventType = body.event_type;
      const event = body.event || {};
      console.log('Event type:', eventType);

      // 1-on-1
      if (eventType === 'message_from_bot_subscriber') {
        const raw = event.message?.text?.content || '';
        const text = normalizeText(raw);
        console.log('1-on-1 raw:', raw, 'normalized:', text);
        if (text.startsWith('/hello')) {
          await sendUserMessage(event.seatalk_id, 'Hello! 👋 This is 1-on-1 reply.');
        }
      }

      // group mention
      if (eventType === 'new_mentioned_message_received_from_group_chat' || eventType === 'message_received_from_group_chat') {
        const raw = event.message?.text?.content || '';
        const text = normalizeText(raw);
        console.log('Group raw:', raw, 'normalized:', text);
        if (text.startsWith('/hello')) {
          await sendGroupMessage(event.group?.group_id, 'Hello group! 👋');
        }
      }

      // bot added to group
      if (eventType === 'bot_added_to_group_chat') {
        await sendGroupMessage(event.group?.group_id, '👋 Hello everyone! Bot is online.');
      }
    } catch (err) {
      console.error('Processing error:', err?.response?.data || err.message || err);
    }
  })();
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('SeaTalk bot running on port', PORT));
