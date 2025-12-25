// index.js
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Read credentials from environment variables
const APP_ID = process.env.SEATALK_APP_ID;
const APP_SECRET = process.env.SEATALK_APP_SECRET;
const SIGNING_SECRET = process.env.SEATALK_SIGNING_SECRET;

// Helper: verify SeaTalk signature
function verifySignature(req) {
  const timestamp = req.headers['x-seatalk-timestamp'];
  const signature = req.headers['x-seatalk-signature'];
  if (!timestamp || !signature) return false;
  const bodyStr = JSON.stringify(req.body);
  const hash = crypto.createHmac('sha256', SIGNING_SECRET)
                     .update(timestamp + bodyStr)
                     .digest('hex');
  return hash === signature;
}

// Health check for Render
app.get('/healthz', (req, res) => res.send('OK'));

// Webhook endpoint for Seatalk
app.post('/callback', async (req, res) => {
  try {
    // Respond to SeaTalk verification challenge first
    if (req.body.seatalk_challenge) {
      return res.send(req.body.seatalk_challenge);
    }

    // Verify signature for normal events
    if (!verifySignature(req)) return res.status(401).send('Invalid signature');

    const payload = req.body;

    // Handle group messages
    if (payload.event_type === 'group_message') {
      const event = payload.event;
      const content = event.message.text?.content || '';

      if (content.toLowerCase().trim() === 'hello @auto bot!') {
        await sendTextToGroup(event.group_code, 'Hello! I am Auto Bot. 👋');
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Error processing webhook:', err);
    res.sendStatus(500);
  }
});


// Function to get access token
async function getAccessToken() {
  const resp = await axios.post('https://openapi.seatalk.io/auth/app_access_token', {
    app_id: APP_ID,
    app_secret: APP_SECRET
  });
  return resp.data.app_access_token;
}

// Function to send message to a group
async function sendTextToGroup(groupId, text) {
  try {
    const token = await getAccessToken();
    const messageBody = {
      group_code: groupId,
      message: {
        tag: 'text',
        text: { content: text }
      }
    };
    await axios.post('https://openapi.seatalk.io/messaging/v2/group_chat',
      messageBody,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

// Listen on Render's PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Seatalk bot running on port ${PORT}`));
