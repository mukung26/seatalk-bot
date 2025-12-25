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

aapp.post('/callback', (req, res) => {
  const body = req.body;
  console.log('Incoming payload (raw):', JSON.stringify(body, null, 2));

  // verification challenge (top-level or event-level)
  if (body.seatalk_challenge || body.event?.seatalk_challenge) {
    return res.json({ seatalk_challenge: body.seatalk_challenge || body.event.seatalk_challenge });
  }

  // ack quickly
  res.sendStatus(200);

  (async () => {
    try {
      const eventType = body.event_type;
      const event = body.event || {};
      console.log('Event type:', eventType);

      // helper: try many possible id fields
      function findUserId(evt) {
        return evt.seatalk_id || evt.subscriber_id || evt.user_id || evt.sender?.seatalk_id || evt.from?.seatalk_id || evt.user?.seatalk_id || null;
      }

      // helper: try many possible group id fields
      function findGroupId(evt) {
        return evt.group?.group_id || evt.group_id || evt.group_id_str || null;
      }

      // normalize text: remove mention tags and HTML-like tags, lowercase, trim
      function normalizeText(raw) {
        if (!raw) return '';
        // remove <at ...>...</at> and any HTML tags and @mentions
        let t = raw.replace(/<at[^>]*>.*?<\/at>/gi, '')
                   .replace(/<[^>]+>/g, '')
                   .replace(/@\S+/g, '')
                   .trim()
                   .toLowerCase();
        return t;
      }

      // unified send wrappers with error logging
      async function safeSendUser(userId, text) {
        if (!userId) return console.warn('No userId to send to');
        try {
          await sendUserMessage(userId, text);
          console.log('Sent 1-on-1 to', userId);
        } catch (err) {
          console.error('sendUserMessage error:', err?.response?.data || err.message || err);
        }
      }
      async function safeSendGroup(groupId, text) {
        if (!groupId) return console.warn('No groupId to send to');
        try {
          await sendGroupMessage(groupId, text);
          console.log('Sent group message to', groupId);
        } catch (err) {
          console.error('sendGroupMessage error:', err?.response?.data || err.message || err);
        }
      }

      // 1-on-1 message
      if (eventType === 'message_from_bot_subscriber' || eventType === 'message_from_user' || eventType === 'direct_message') {
        const raw = event.message?.text?.content || event.message?.content || event.text || '';
        const text = normalizeText(raw);
        console.log('1-on-1 raw:', raw, 'normalized:', text);
        if (text.startsWith('/hello')) {
          const userId = findUserId(event) || body.sender?.seatalk_id || body.user?.seatalk_id;
          await safeSendUser(userId, 'Hello! 👋 This is 1-on-1 reply.');
        }
      }

      // group mention or group message
      if (eventType === 'new_mentioned_message_received_from_group_chat' || eventType === 'message_received_from_group_chat' || eventType === 'group_message') {
        const raw = event.message?.text?.content || event.message?.content || event.text || '';
        const text = normalizeText(raw);
        console.log('Group raw:', raw, 'normalized:', text);
        if (text.startsWith('/hello')) {
          const groupId = findGroupId(event) || event.group_id || body.group?.group_id;
          await safeSendGroup(groupId, 'Hello group! 👋');
        }
      }

      // bot added to group
      if (eventType === 'bot_added_to_group_chat') {
        const groupId = findGroupId(event);
        await safeSendGroup(groupId, '👋 Hello everyone! Bot is online.');
      }
    } catch (err) {
      console.error('Processing error:', err?.response?.data || err.message || err);
    }
  })();
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('SeaTalk bot running on port', PORT));
