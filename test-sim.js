const axios = require('axios');

const CALLBACK_URL = 'http://localhost:3000/callback';

// Simulate 1-on-1 message
(async () => {
  const resp1 = await axios.post(CALLBACK_URL, {
    event_id: '1',
    event_type: 'message_from_bot_subscriber',
    timestamp: Date.now(),
    app_id: 'dummy',
    event: {
      seatalk_id: 'test_user_1',
      message: { tag: 'text', text: { content: '/hello' } }
    }
  }, { headers: { signature: 'dummy' } });
  console.log('1-on-1 test response status:', resp1.status);

  // Simulate group mention
  const resp2 = await axios.post(CALLBACK_URL, {
    event_id: '2',
    event_type: 'new_mentioned_message_received_from_group_chat',
    timestamp: Date.now(),
    app_id: 'dummy',
    event: {
      group: { group_id: 'NTk0MzI5MTY4NzE2' },
      message: { tag: 'text', text: { content: '/hello' } }
    }
  }, { headers: { signature: 'dummy' } });
  console.log('Group chat test response status:', resp2.status);
})();
