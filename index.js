const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

// Env variables
const APP_ID = process.env.SEATALK_APP_ID;
const APP_SECRET = process.env.SEATALK_APP_SECRET;
const SIGNING_SECRET = process.env.SEATALK_SIGNING_SECRET;

// Verify signature
function verifySignature(rawBody, signature) {
  const hash = crypto.createHmac('sha256', SIGNING_SECRET)
                     .update(rawBody)
                     .digest('hex');
  return hash === signature;
}

// Health check
app.get('/healthz', (req, res) => res.send('OK'));

// Callback
app.post('/callback', (req, res) => {
  const rawBody = JSON.stringify(req.body); // string for signature
  const signature = req.headers['signature'] || req.headers['Signature'];

  // Signature verification for non-verification events
  if (req.body.event_type !== 'event_verification' && !verifySignature(rawBody, signature)) {
    return res.status(401).send('Invalid signature');
  }

  // Handle verification challenge
  if (req.body.event_type === 'event_verification') {
    const challenge = req.body.event.seatalk_challenge;
    return res.json({ seatalk_challenge: challenge });
  }

  // Handle other events asynchronously
  if (req.body.event_type === 'new_mentioned_message_received_from_group_chat') {
    const event = req.body.event;
    const content = event.message.text?.content || '';
    if (content.toLowerCase().trim() === 'hello @auto bot!') {
      sendTextToGroup(event.group_code, 'Hello! I am Auto Bot. 👋');
    }
  }

  // Respond 200 immediately
  res.sendStatus(200);
});

// Send message function
async function getAccessToken() {
  const resp = await axios.post('https://openapi.seatalk.io/auth/app_access_token', {
    app_id: APP_ID,
    app_secret: APP_SECRET
  });
  return resp.data.app_access_token;
}

async function sendTextToGroup(groupId, text) {
  try {
    const token = await getAccessToken();
    await axios.post('https://openapi.seatalk.io/messaging/v2/group_chat', {
      group_code: groupId,
      message: { tag: 'text', text: { content: text } }
    }, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

// Listen on Render port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Seatalk bot running on port ${PORT}`));
