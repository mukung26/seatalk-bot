const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

// Environment variables
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

// Callback endpoint
app.post('/callback', async (req, res) => {
  const rawBody = JSON.stringify(req.body);
  const signature = req.headers['signature'] || req.headers['Signature'];

  // Verification challenge
  if (req.body.event_type === 'event_verification') {
    const challenge = req.body.event.seatalk_challenge;
    return res.json({ seatalk_challenge: challenge });
  }

  // Verify signature for normal events
  if (!verifySignature(rawBody, signature)) {
    return res.status(401).send('Invalid signature');
  }

  const eventType = req.body.event_type;
  const event = req.body.event;

  // Handle Bot Added To Group Chat
  if (eventType === 'bot_added_to_group_chat') {
    const groupId = event.group.group_id;
    const groupName = event.group.group_name;

    // Send greeting message
    await sendTextToGroup(groupId, `Hello ${groupName}! I am TEST123 🤖. Happy to join the group!`);
  }

  res.sendStatus(200);
});

// Get App Access Token
async function getAccessToken() {
  const resp = await axios.post('https://openapi.seatalk.io/auth/app_access_token', {
    app_id: APP_ID,
    app_secret: APP_SECRET
  });
  return resp.data.app_access_token;
}

// Send message to group
async function sendTextToGroup(groupId, text) {
  try {
    const token = await getAccessToken();
    const messageBody = {
      group_id: groupId,
      message: {
        tag: 'text',
        text: {
          format: 1, // Markdown formatted
          content: text
        }
      }
    };

    await axios.post(
      'https://openapi.seatalk.io/messaging/v2/group_chat',
      messageBody,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`Greeting sent to group ${groupId}`);
  } catch (err) {
    console.error('Error sending greeting message:', err.response?.data || err.message);
  }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Seatalk bot running on port ${PORT}`));
