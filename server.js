require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
// Webhook route needs the raw body for signature verification
app.use('/webhooks/callback', express.raw({ type: 'application/json' }));
// All other routes use parsed JSON
app.use(express.json());
app.use(express.static('public'));

// Twitch API credentials
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const EVENTSUB_SECRET = process.env.EVENTSUB_SECRET;

let accessToken = null;

// Get Twitch OAuth token
async function getTwitchAccessToken() {
  try {
    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials'
      }
    });
    accessToken = response.data.access_token;
    console.log('✅ Obtained Twitch access token');
    return accessToken;
  } catch (error) {
    console.error('❌ Error getting Twitch access token:', error.response?.data || error.message);
    throw error;
  }
}

// Verify Twitch webhook signature using the raw body buffer
function verifyTwitchSignature(req, rawBody) {
  const messageId = req.headers['twitch-eventsub-message-id'];
  const timestamp = req.headers['twitch-eventsub-message-timestamp'];
  const messageSignature = req.headers['twitch-eventsub-message-signature'];

  const hmac = crypto.createHmac('sha256', EVENTSUB_SECRET);
  hmac.update(messageId + timestamp + rawBody);
  const expectedSignature = 'sha256=' + hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(messageSignature)
  );
}

// Twitch EventSub webhook endpoint
app.post('/webhooks/callback', (req, res) => {
  const messageType = req.headers['twitch-eventsub-message-type'];
  const rawBody = req.body.toString('utf8');
  const parsedBody = JSON.parse(rawBody);

  // Verify signature using the original raw body string
  if (!verifyTwitchSignature(req, rawBody)) {
    console.error('❌ Invalid signature');
    return res.status(403).send('Forbidden');
  }

  // Handle webhook verification challenge
  if (messageType === 'webhook_callback_verification') {
    console.log('✅ Webhook verification request received');
    return res.status(200).send(parsedBody.challenge);
  }

  // Handle notification
  if (messageType === 'notification') {
    const event = parsedBody.event;
    console.log('🔔 Bits event received:', event);

    // Calculate number of spins based on bits (field is "bits", not "bits_used")
    const bits = event.bits;
    const spins = Math.floor(bits / 100);

    if (spins > 0) {
      const donorName = event.user_name;
      console.log(`💎 ${donorName} donated ${bits} bits = ${spins} spin(s)`);

      // Emit to all connected clients
      io.emit('newSpin', {
        donor: donorName,
        bits: bits,
        spins: spins,
        message: event.message || ''
      });
    }

    return res.status(200).send('OK');
  }

  // Handle revocation
  if (messageType === 'revocation') {
    console.log('⚠️ Subscription revoked:', parsedBody);
    return res.status(200).send('OK');
  }

  res.status(200).send('OK');
});

// Manual test endpoint (for testing without actual bits)
app.post('/api/test-spin', (req, res) => {
  const { donor, bits } = req.body;
  const spins = Math.floor((bits || 100) / 100);

  console.log(`🧪 TEST: ${donor || 'TestUser'} - ${bits || 100} bits = ${spins} spin(s)`);

  io.emit('newSpin', {
    donor: donor || 'TestUser',
    bits: bits || 100,
    spins: spins,
    message: 'Test spin!'
  });

  res.json({ success: true, spins });
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });

  socket.on('spinComplete', (data) => {
    console.log('🎯 Spin result:', data);
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
server.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📺 Open http://localhost:${PORT} for the wheel overlay`);
  console.log(`🧪 Test endpoint: POST http://localhost:${PORT}/api/test-spin`);

  // Get Twitch access token on startup
  try {
    await getTwitchAccessToken();
  } catch (error) {
    console.error('⚠️ Failed to get Twitch access token. EventSub won\'t work.');
  }
});
