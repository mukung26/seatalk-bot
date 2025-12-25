const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json()); // use built-in parser

const APP_ID = process.env.SEATALK_APP_ID;
const APP_SECRET = process.env.SEATALK_APP_SECRET;

app.get('/healthz', (req, res) => res.send('OK'));

async function getAccessToken() {
  const res = await axios.post('https://openapi.seatalk.io/auth/app_access_token', {
    app_id: APP_ID,
    app_secret: APP_SECRET
  });
  return res.data.app_access_token;
}

async function sendGroupMessage(groupId, text) {
  const token = await getAccessToken();
  return axios.post('https://openapi.seatalk.io/messaging/v2/group_chat', {
    group_id: groupId,
    message: { tag: 'text', text: { format: 2, content: text } }
  }, { headers: { Authorization: `Bearer ${token}` } });
}

async function sendUserMessage(userId, text) {
  const token = await getAccessToken();
  return axios.post('https://openapi.seatalk.io/messaging/v2/bot_chat', {
    bot_user_id: userId,
    message: { tag: 'text', text: { format: 2, content: text } }
  }, { headers: { Authorization: `Bearer ${token}` } });
}

function extractPlainText(raw) {
  if (!raw) return '';
  // remove common mention markup like <at user_id> or @BotName
  return raw.replace(/<at[^>]*>.*?<\/at>/g, '').replace(/@\S+/g, '').trim();
}

app.post('/callback', (req, res) => {
  const body = req.body;
  console.log('Incoming payload:', JSON.stringify(body, null, 2));

  // handle verification challenge (check both top-level and event-level)
  if (body.seatalk_challenge || body.event?.seatalk_challenge) {
    return res.json({ seatalk_challenge: body.seatalk_challenge || body.event.seatalk_challenge });
  }

  // acknowledge quickly
  res.sendStatus(200);

  // process asynchronously
  (async () => {
    try {
      const eventType = body.event_type;
      const event = body.event || {};
      // 1-on-1 message from subscriber
      if (eventType === 'message_from_bot_subscriber') {
        const raw = event.message?.text?.content;
        const text = extractPlainText(raw);
        if (text === '/hello') {
          await sendUserMessage(event.seatalk_id || event.subscriber_id || event.user_id, 'Hello! 👋 This is 1-on-1 reply.');
        }
      }

      // group mention or new message in group
      if (eventType === 'new_mentioned_message_received_from_group_chat' || eventType === 'message_received_from_group_chat') {
        const raw = event.message?.text?.content;
        const text = extractPlainText(raw);
        if (text === '/hello') {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('SeaTalk bot running on port', PORT));
