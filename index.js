const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();

// Middleware to capture raw body for verification
app.use('/callback', express.raw({ type: '*/*' }));

// Credentials
const APP_ID = process.env.SEATALK_APP_ID;
const APP_SECRET = process.env.SEATALK_APP_SECRET;
const SIGNING_SECRET = process.env.SEATALK_SIGNING_SECRET;

// Verify signature
function verifySignature(rawBody, headers) {
  const timestamp = headers['x-seatalk-timestamp'];
  const signature = headers['x-seatalk-signature'];
  if (!timestamp || !signature) return false;
  const hash = crypto.createHmac('sha256', SIGNING_SECRET)
                     .update(timestamp + rawBody)
                     .digest('hex');
  return hash === signature;
}

// Health check
app.get('/healthz', (req, res) => res.send('OK'));

// Callback endpoint
app.post('/callback', (req, res) => {
  const rawBody = req.body.toString();

  // Try parsing JSON
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    parsed = {};
  }

  // Verification challenge
  if (parsed.seatalk_challenge) {
    res.setHeader('Content-Type', 'text/plain');
    return res.send(parsed.seatalk_challenge); // raw string
  }

  // Verify signature for normal events
  if (!verifySignature(rawBody, req.headers)) return res.status(401).send('Invalid signature');

  // Handle group messages asynchronously
  if (parsed.event_type === 'group_message') {
    const event = parsed.event;
    const content = event.message.text?.content || '';
    if (content.toLowerCase().trim() === 'hello @auto bot!') {
      sendTextToGroup(event.group_code, 'Hello! I am Auto Bot. 👋');
    }
  }

  // Respond immediately
  res.sendStatus(200);
});

// Functions to send messages
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Seatalk bot running on port ${PORT}`));
