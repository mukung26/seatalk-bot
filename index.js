const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const APP_ID = process.env.SEATALK_APP_ID;
const APP_SECRET = process.env.SEATALK_APP_SECRET;

let groupIds = []; // In-memory list of group IDs the bot is in

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

async function sendUserMessage(employeeCode, text) {
  const token = await getAccessToken();
  try {
    const res = await axios.post(
      'https://openapi.seatalk.io/messaging/v2/single_chat',
      {
        employee_code: employeeCode,
        message: {
          tag: 'text',
          text: { format: 2, content: text }
        }
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('sendUserMessage success:', res.data);
  } catch (err) {
    console.error('sendUserMessage error:', err?.response?.status, err?.response?.data || err.message);
  }
}

async function getJoinedGroups() {
  const token = await getAccessToken();
  try {
    const res = await axios.get('https://openapi.seatalk.io/messaging/v2/group_chat/joined', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.code === 0) {
      groupIds = res.data.joined_group_chats.group_id || [];
      console.log('Fetched joined groups:', groupIds);
    } else {
      console.error('Failed to fetch joined groups:', res.data);
    }
  } catch (err) {
    console.error('Error fetching joined groups:', err?.response?.data || err.message);
  }
}


function normalizeText(raw) {
  if (!raw) return '';
  return raw.replace(/<at[^>]*>.*?<\/at>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/@\S+/g, '')
            .trim()
            .toLowerCase();
}

app.post('/callback', (req, res) => {
  const body = req.body;
  console.log('Incoming payload (raw):', JSON.stringify(body, null, 2));

  if (body.seatalk_challenge || body.event?.seatalk_challenge) {
    return res.json({ seatalk_challenge: body.seatalk_challenge || body.event.seatalk_challenge });
  }

  res.sendStatus(200);

  (async () => {
    try {
      const eventType = body.event_type;
      const event = body.event || {};
      console.log('Event type:', eventType);

      if (eventType === 'message_from_bot_subscriber') {
        const raw = event.message?.text?.content || '';
        const text = normalizeText(raw);
        if (text.startsWith('/hello') || text === 'hello') {
          await sendUserMessage(event.employee_code, 'Hello! 👋 This is 1-on-1 reply.');
        }
      }


      if (eventType === 'new_mentioned_message_received_from_group_chat' || eventType === 'message_received_from_group_chat') {
        const raw = event.message?.text?.plain_text || event.message?.text?.content || '';
        const text = normalizeText(raw);
        console.log('Group raw:', raw, 'normalized:', text);
        if (text.includes('/hello') || text === 'hello') {
          await sendGroupMessage(event.group_id, 'Hello group! 👋');
        }
      }

      if (eventType === 'bot_added_to_group_chat') {
        const groupId = event.group?.group_id;
        if (groupId && !groupIds.includes(groupId)) {
          groupIds.push(groupId);
        }
        await sendGroupMessage(groupId, '👋 Hello everyone! Bot is online.');
      }
    } catch (err) {
      console.error('Processing error:', err?.response?.data || err.message || err);
    }
  })();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('SeaTalk bot running on port', PORT));

function startCountdown(seconds = 60) {
  console.log(`Reminder in ${seconds} seconds`);
  if (seconds > 0) {
    setTimeout(() => startCountdown(seconds - 1), 1000);
  }
}

function scheduleNextReminder() {
  const now = new Date();
  const nextReminder = new Date(now);
  nextReminder.setUTCHours(21, 55, 0, 0); // 21:55 UTC = 5:55 AM GMT+8
  if (now.getUTCHours() > 21 || (now.getUTCHours() === 21 && now.getUTCMinutes() >= 55)) {
    nextReminder.setUTCDate(nextReminder.getUTCDate() + 1);
  }
  const delay = nextReminder - now;
  const hours = Math.floor(delay / (1000 * 60 * 60));
  const minutes = Math.floor((delay % (1000 * 60 * 60)) / (1000 * 60));
  console.log(`Next daily reminder scheduled in ${hours} hours and ${minutes} minutes.`);
  setTimeout(sendDailyReminder, delay);
  if (delay > 60000) {
    setTimeout(() => startCountdown(), delay - 60000);
  } else {
    startCountdown(Math.floor(delay / 1000));
  }
}

async function sendDailyReminder() {
  const message = "Don't forget to fill up the IT Sheet form.";
  console.log(`Sending daily reminder to ${groupIds.length} groups:`, groupIds);
  for (const groupId of groupIds) {
    await sendGroupMessage(groupId, message);
  }
  // Schedule the next one
  scheduleNextReminder();
}

// Initial setup
(async () => {
  await getJoinedGroups();
  scheduleNextReminder();
})();
