# Spin Wheel On Bits - Diablo 2 Loot Distribution

A Twitch-integrated spinning wheel application for Diablo 2 streamers. When viewers donate 100+ bits, they get to spin a wheel that determines whether you keep, share, or drop that unique item or high rune you just found!

## Features

- 🎡 **40-Segment Wheel**
  - 20 "Keep" segments (50%)
  - 19 "Keep - Share" segments (47.5%)
  - 1 "DROP" segment (2.5%) - displayed in red

- 💎 **Bits Integration**
  - 100 bits = 1 spin
  - 200 bits = 2 spins
  - 300 bits = 3 spins, etc.

- 🔴 **Real-time Updates**
  - Instant wheel spins when bits are donated
  - Multiple spins queue automatically
  - Beautiful animations and visual feedback

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Twitch Application

1. Go to [Twitch Developer Console](https://dev.twitch.tv/console/apps)
2. Click "Register Your Application"
3. Fill in:
   - **Name**: SpinWheelOnBits (or your choice)
   - **OAuth Redirect URLs**: `http://localhost:3000/auth/callback`
   - **Category**: Application Integration
4. Click "Create"
5. Click "Manage" on your new application
6. Copy your **Client ID** and generate a **Client Secret**

### 3. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
TWITCH_CLIENT_ID=your_client_id_here
TWITCH_CLIENT_SECRET=your_client_secret_here
TWITCH_CHANNEL_NAME=your_twitch_username
TWITCH_USER_ID=your_user_id
EVENTSUB_CALLBACK_URL=https://your-ngrok-url.ngrok.io/webhooks/callback
EVENTSUB_SECRET=any_random_string_here
```

**To get your Twitch User ID:**
```bash
# After getting your access token, use Twitch API:
curl -X GET 'https://api.twitch.tv/helix/users?login=YOUR_USERNAME' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Client-Id: YOUR_CLIENT_ID'
```

### 4. Expose Webhook Endpoint (for Twitch EventSub)

For local development, you need to expose your localhost to the internet so Twitch can send webhooks:

**Using ngrok (recommended):**

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) and update `EVENTSUB_CALLBACK_URL` in your `.env` file.

### 5. Subscribe to Bits Events

You'll need to create an EventSub subscription for Bits events. This requires your app access token and broadcaster ID.

**Script to create subscription** (you can add this or use curl):

```bash
curl -X POST 'https://api.twitch.tv/helix/eventsub/subscriptions' \
  -H 'Authorization: Bearer YOUR_APP_ACCESS_TOKEN' \
  -H 'Client-Id: YOUR_CLIENT_ID' \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "channel.cheer",
    "version": "1",
    "condition": {
      "broadcaster_user_id": "YOUR_USER_ID"
    },
    "transport": {
      "method": "webhook",
      "callback": "https://your-ngrok-url.ngrok.io/webhooks/callback",
      "secret": "YOUR_EVENTSUB_SECRET"
    }
  }'
```

## Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The application will start on `http://localhost:3000`

## Usage

### 1. OBS Setup (Stream Overlay)

1. Open OBS Studio
2. Add a new **Browser Source**
3. Set URL to: `http://localhost:3000`
4. Set Width: `1920`
5. Set Height: `1080`
6. Check "Shutdown source when not visible"
7. Check "Refresh browser when scene becomes active"

### 2. Testing Without Bits

Use the test controls on the webpage:

1. Open `http://localhost:3000` in your browser
2. Enter a donor name and bits amount
3. Click "Test Spin"

Or use the API directly:

```bash
curl -X POST http://localhost:3000/api/test-spin \
  -H 'Content-Type: application/json' \
  -d '{"donor": "TestViewer", "bits": 200}'
```

### 3. Going Live

1. Make sure your EventSub subscription is active
2. Start your stream
3. Add the browser source to your OBS scene
4. When viewers donate bits, the wheel spins automatically!

## How It Works

1. Viewer donates bits on your Twitch channel
2. Twitch sends a webhook to your server via EventSub
3. Server calculates spins (bits ÷ 100)
4. Server sends spin command to frontend via Socket.io
5. Wheel spins with animation
6. Result is displayed (Keep, Keep - Share, or DROP)
7. If multiple spins, they queue and play sequentially

## Troubleshooting

### Bits donations not triggering spins

- Check that your EventSub subscription is active
- Verify ngrok is running and URL matches your `.env`
- Check server logs for webhook errors
- Ensure `EVENTSUB_SECRET` matches in both `.env` and subscription

### Wheel not spinning

- Check browser console for errors
- Verify Socket.io connection is established
- Try the test endpoint to isolate the issue

### Token expired

- Tokens expire - restart the server to get a new one
- For production, implement token refresh logic

## License

ISC

## Credits

Made for Diablo 2 streamers who want to add interactive loot distribution to their streams!
