# Sarvam AI Voice Setup Guide

## Overview
InterVox now uses **Sarvam AI** for realistic Indian voice text-to-speech during interviews. Users can select their preferred AI voice interviewer from the interview setup modal.

## Available Voices
- **Meera** (Female) - Warm and professional
- **Kavya** (Female) - Clear and confident
- **Arjun** (Male) - Deep and authoritative
- **Ananya** (Female) - Friendly and engaging

## Setup Instructions

### 1. Get Sarvam AI API Key
1. Visit [Sarvam AI](https://www.sarvam.ai/) and sign up for an account
2. Navigate to the API section and generate an API key
3. Copy your API subscription key

### 2. Configure Backend
1. Open `server/.env` file
2. Find the line: `SARVAM_API_KEY=your-sarvam-api-key-here`
3. Replace `your-sarvam-api-key-here` with your actual Sarvam AI API key:
   ```
   SARVAM_API_KEY=your-actual-api-key-from-sarvam
   ```
4. Save the file

### 3. Restart Backend Server
```bash
cd server
npm run dev
```

The server will automatically restart if you're using nodemon.

## How It Works

### User Flow
1. User clicks "Start AI Interview" from dashboard
2. "Set Up Your Interview" modal appears
3. User selects:
   - Role (e.g., Software Engineer)
   - Experience level (Fresher/Mid/Senior)
   - Focus tags (Behavioral, Technical, etc.)
   - **AI Voice Interviewer** (Meera, Kavya, Arjun, or Ananya)
4. User clicks "Start Interview"
5. The interview page loads with the selected voice
6. Questions are automatically asked using the selected Sarvam AI voice

### Technical Implementation
- Frontend: `useSarvamTTS` hook calls backend API
- Backend: `POST /api/interview/text-to-speech` endpoint calls Sarvam AI API
- Audio: Returns MP3 audio stream from Sarvam AI
- Voice selection: Stored in localStorage and passed to interview page

## API Details

### Endpoint Used
```
POST https://api.sarvam.ai/text-to-speech
```

### Request Format
```json
{
  "inputs": ["Your interview question text"],
  "target_language_code": "en-IN",
  "speaker": "meera",
  "pitch": 0,
  "pace": 1.0,
  "loudness": 1.5,
  "speech_sample_rate": 22050,
  "enable_preprocessing": true,
  "model": "bulbul:v1"
}
```

### Headers
```
Content-Type: application/json
API-Subscription-Key: your-api-key
```

## Fallback Mode
If no API key is configured, the backend returns a mock MP3 file and logs a warning:
```
⚠️ No Sarvam API key found - returning mock audio
⚠️ Add SARVAM_API_KEY to .env file to enable real TTS
```

## Testing
1. Complete the setup steps above
2. Go to dashboard → Click "Start AI Interview"
3. Select a voice in the modal
4. Start the interview
5. The first question should be automatically spoken in the selected voice
6. Check browser console for logs:
   - `🎤 Using voice: meera`
   - `🔊 Auto-speaking question: Tell me about yourself...`
   - `✅ Sarvam AI TTS generated: XXXXX bytes`

## Troubleshooting

### Issue: No voice playing
- **Check**: Browser console for errors
- **Check**: Backend terminal for API errors
- **Fix**: Ensure SARVAM_API_KEY is set correctly in `.env`
- **Fix**: Restart backend server after updating `.env`

### Issue: "API error: 401"
- **Cause**: Invalid or missing API key
- **Fix**: Double-check your Sarvam AI API key

### Issue: "API error: 429"
- **Cause**: Rate limit exceeded
- **Fix**: Wait a few minutes or upgrade your Sarvam AI plan

### Issue: "Audio playback failed"
- **Cause**: Browser autoplay policy
- **Fix**: Click the "🔊 Click to Hear Question" button once to enable audio
- **Note**: After first click, all subsequent questions will auto-play

## Cost Considerations
- Sarvam AI charges per character of text synthesized
- Each interview question is typically 50-150 characters
- A 10-question interview ≈ 500-1500 characters
- Check Sarvam AI pricing page for current rates

## Support
For issues with:
- **Sarvam AI API**: Contact [Sarvam AI Support](https://www.sarvam.ai/contact)
- **InterVox Integration**: Check backend logs and browser console

---

**Note**: Make sure to keep your API key confidential and never commit it to version control!
