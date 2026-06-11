# API Setup Guide for InterVox Voice Features

## Overview
InterVox uses two main APIs for the voice interview features:
1. **Groq API** - For speech-to-text transcription (Whisper model)
2. **Sarvam AI** - For Indian-accented text-to-speech

## 🎯 Why You Need These APIs

### Without API Keys:
- ❌ AI voice questions won't play (you'll see mock audio warnings)
- ❌ Your spoken answers won't be transcribed (you'll get mock transcriptions)
- ❌ Interview experience will be broken

### With API Keys:
- ✅ AI asks questions in natural Indian voices
- ✅ Your speech is accurately transcribed in real-time
- ✅ Full interview experience works seamlessly

---

## 🚀 Quick Setup (5 minutes)

### Step 1: Get Groq API Key (FREE - for transcription)

1. Go to **https://console.groq.com/**
2. Sign up for a free account
3. Navigate to "API Keys" section
4. Click "Create API Key"
5. Copy your API key (starts with `gsk_...`)

**Cost:** FREE tier includes:
- 14,400 requests per day
- More than enough for personal use

### Step 2: Get Sarvam AI API Key (for Indian TTS)

1. Go to **https://www.sarvam.ai/**
2. Sign up for an account
3. Navigate to the API section
4. Generate your API subscription key
5. Copy your API key

**Cost:** Check their pricing page for current rates

### Step 3: Add Keys to Your .env File

1. Open `server/.env` file in your editor
2. Find these lines:
   ```env
   GROQ_API_KEY=your-groq-api-key-here
   SARVAM_API_KEY=your-sarvam-api-key-here
   ```
3. Replace the placeholder values with your actual keys:
   ```env
   GROQ_API_KEY=gsk_your_actual_groq_key_here
   SARVAM_API_KEY=your_actual_sarvam_key_here
   ```
4. **Save the file**

### Step 4: Restart the Server

```bash
# Stop the current server (Ctrl+C in the terminal)
# Then restart:
cd server
npm run dev
```

---

## 🧪 Testing Your Setup

### Test 1: Check Server Logs
When you start the server, you should see:
```
Server is running on port 8000
```

### Test 2: Try Voice Interview
1. Go to Dashboard → "Start AI Interview"
2. Select a voice and start interview
3. When the question plays:
   - ✅ You should hear actual voice (not silence)
   - ✅ Console should show: "🔊 Sarvam TTS started playing!"

### Test 3: Test Transcription
1. Click the microphone button and speak
2. Click stop recording
3. Check if your speech is transcribed correctly
4. Console should show: "✅ Transcription successful"

---

## 🐛 Troubleshooting

### Issue: "Mock transcription" or "Mock audio" in console

**Solution:** 
- Check that API keys are properly set in `server/.env`
- Keys should NOT contain quotes
- Make sure there are no extra spaces
- Restart the server after updating .env

### Issue: Server won't start / TypeScript errors

**Solution:**
```bash
cd server
npm install
npm run dev
```

### Issue: Audio plays but voice is robotic/unclear

**Solution:**
- This is normal for the mock audio
- Make sure you've added the real Sarvam API key
- Check server console for warnings

### Issue: Transcription is inaccurate

**Solution:**
- Speak clearly into your microphone
- Ensure microphone permissions are granted
- Try using a better microphone
- Check that Groq API key is valid

---

## 📊 Current Status

Run this checklist:

- [ ] Server running on port 8000
- [ ] GROQ_API_KEY added to server/.env
- [ ] SARVAM_API_KEY added to server/.env
- [ ] Server restarted after adding keys
- [ ] No warning messages in server console about missing keys
- [ ] Voice questions play with actual audio
- [ ] Speech transcription works accurately

---

## 💡 Alternative: Use Browser TTS (No API Key Needed)

If you want to test without setting up Sarvam AI:

1. Open `src/app/pages/LiveInterview.tsx`
2. Change the import at the top:
   ```typescript
   // Replace this:
   import { useSarvamTTS } from "../../hooks/useSarvamTTS";
   
   // With this:
   import { useSpeechSynthesis as useSarvamTTS } from "../../hooks/useSpeechSynthesis";
   ```

This will use your browser's built-in TTS (but won't have Indian accents).

---

## 🔒 Security Notes

- Never commit your `.env` file to Git
- Keep your API keys private
- The `.env` file is already in `.gitignore`
- Don't share your API keys with anyone

---

## 📞 Need Help?

If you're still having issues:
1. Check the browser console (F12) for errors
2. Check the server terminal for error messages
3. Make sure both frontend and backend are running
4. Verify your API keys are valid by testing them directly on the provider websites

---

## ✅ Success!

Once everything is set up, you should be able to:
- Start an AI interview
- Hear questions in natural Indian voices
- Speak your answers
- See accurate transcriptions
- Get AI evaluation of your responses

**Happy interviewing! 🎉**
