# Voice Interview Feature - Complete Setup ✅

## 🎉 What's Working Now

Your InterVox interview page now has **fully functional AI voice features**:

### ✅ Automatic Voice Questions
- First question automatically speaks **1.5 seconds** after page load
- All subsequent questions **automatically speak** when you move to the next question
- No need to click "Play" button - it's all automatic!

### ✅ Human-like AI Voice
- Uses **Sarvam AI Kavya** voice (Professional Indian female voice)
- **Optimized speech settings** for natural interview experience:
  - Pace: 0.95 (slightly slower for clarity)
  - Pitch: 0 (neutral, professional tone)
  - Loudness: 1.5 (clear and audible)
  - High-quality 22kHz audio

### ✅ Accurate Speech-to-Text
- Your spoken answers are transcribed using **Groq Whisper API**
- Real-time audio capture and processing
- High accuracy with noise suppression

---

## 🚀 How to Use the Voice Interview

### Step 1: Start an Interview
1. Go to Dashboard
2. Click "Start AI Interview"
3. Configure your interview (role, difficulty, question count)
4. Click "Start Interview"

### Step 2: Wait for AI to Speak
- **Automatically** after 1.5 seconds, you'll hear:
  - *"Hello! Welcome to your interview. Let's begin. Tell me about yourself and your background."*
- You'll see a green "AI is speaking..." indicator

### Step 3: Answer the Question
**Voice Mode (Recommended):**
1. Click the microphone button (it turns blue)
2. Speak your answer clearly
3. Click the microphone again to stop recording
4. Your transcription appears automatically

**Text Mode:**
1. Click "Text Answer" tab
2. Type your response
3. Click "Submit Answer"

### Step 4: Next Question
- Click "Next Question" button
- AI will **automatically speak** the next question
- No need to click replay!

---

## 🔧 Features & Controls

### Audio Controls
- **🔊 Mute/Unmute** - Top right corner toggles AI voice
- **🔁 Replay Question** - Button appears if you want to hear question again
- **⏭️ Skip Question** - Skip to next question without answering

### Visual Indicators
- **Green pulsing dots** = AI is currently speaking
- **Red recording indicator** = Your microphone is recording
- **Blue microphone** = Currently recording your answer
- **Audio waveform** = Shows your voice level in real-time

---

## 🎯 Interview Flow

```
1. Page Loads
   ↓
2. Camera/Mic Permissions Requested
   ↓
3. First Question Appears (in text)
   ↓
4. 1.5 seconds delay
   ↓
5. AI Automatically Speaks Question
   ↓
6. You Answer (Voice or Text)
   ↓
7. Click "Next Question"
   ↓
8. AI Automatically Speaks Next Question
   ↓
9. Repeat until all questions done
   ↓
10. View Results with AI Evaluation
```

---

## 🧪 Testing Checklist

### ✅ Test Voice Output (TTS)
1. Start an interview
2. Wait 1.5 seconds
3. **Expected:** You hear a clear Indian female voice speaking the question
4. **Console:** Should show "🔊 Auto-speaking first question with Sarvam AI..."

### ✅ Test Voice Input (STT)
1. Click microphone button
2. Speak clearly: "I am a software engineer with 5 years of experience"
3. Click microphone again to stop
4. **Expected:** Your exact words appear as text
5. **Console:** Should show "✅ Transcription successful..."

### ✅ Test Auto-Play for Next Questions
1. Answer first question
2. Click "Next Question"
3. **Expected:** Next question automatically speaks within 0.3 seconds
4. **No manual replay needed**

---

## 🐛 Troubleshooting

### Issue: No voice heard at all

**Check:**
```
1. Speaker/headphone volume is up
2. Browser isn't muted
3. Check browser console for errors
4. Verify server is running on port 8000
5. Check SARVAM_API_KEY is set in server/.env
```

**Fix:**
```bash
# Check server logs
cd server
# You should see: "✅ Sarvam AI TTS generated: XXXX bytes"
```

### Issue: Mock transcription messages

**Problem:** GROQ_API_KEY not set or invalid

**Fix:**
1. Open `server/.env`
2. Verify your key: `GROQ_API_KEY=gsk_...` (should start with `gsk_`)
3. Restart server: `cd server; npm run dev`

### Issue: Voice is too fast/slow/loud

**Adjust in:** `server/src/server.ts` (lines 120-129)
```typescript
pace: 0.95,     // 0.7 = slower, 1.2 = faster
pitch: 0,       // -5 to +5 (negative = deeper)
loudness: 1.5,  // 0.5 to 2.0
```

### Issue: First question doesn't auto-play

**Browser Autoplay Policy:**
- Some browsers block autoplay
- If this happens, user will see the "🔊 Click to Hear Question" button
- One click enables autoplay for rest of interview

---

## 📊 API Usage

### Groq API (Whisper Transcription)
- **Free Tier:** 14,400 requests/day
- **Cost per request:** FREE
- **Average interview:** ~10-15 requests
- **Monthly limit:** Plenty for personal use

### Sarvam AI (Text-to-Speech)
- Check their pricing: https://www.sarvam.ai/
- **Average question:** ~50-100 words
- **Cost:** Varies by usage
- **Tip:** Use concise questions to save costs

---

## 🎨 Customization Options

### Change AI Voice Gender/Style

**Available Voices:**
- `kavya` - Professional female (current)
- `amit` - Warm male
- `priya` - Friendly female  
- `neha` - Professional female

**To Change:**
In `src/app/pages/LiveInterview.tsx`, find:
```typescript
speak(firstQuestion.question, { language: 'en-IN', speaker: 'kavya' });
```
Change `'kavya'` to any voice above.

### Adjust Auto-Play Delay

**Current:** 1.5 seconds
**Location:** `src/app/pages/LiveInterview.tsx` line ~128

```typescript
setTimeout(() => {
  speak(firstQuestion.question, ...);
}, 1500); // Change this number (milliseconds)
```

---

## 🔒 Security & Privacy

- ✅ Audio is processed securely via HTTPS
- ✅ Transcriptions are temporary (not stored permanently)
- ✅ API keys are server-side only (not exposed to browser)
- ✅ Camera feed stays local (not uploaded)

---

## 📈 Performance Tips

### For Best Results:

1. **Microphone Quality**
   - Use a good quality microphone or headset
   - Reduce background noise
   - Speak clearly and at moderate pace

2. **Internet Connection**
   - Stable connection recommended
   - TTS/STT requires internet
   - ~1-2 MB per interview session

3. **Browser Compatibility**
   - Chrome/Edge: ✅ Excellent
   - Firefox: ✅ Good
   - Safari: ⚠️ May need manual first click

---

## ✨ What Makes This Natural?

1. **Automatic Speech** - No clicking play buttons
2. **Human Pacing** - 1.5s delay before first question (feels natural)
3. **Professional Voice** - Clear Indian accent
4. **Visual Feedback** - Animated indicators show what's happening
5. **Smooth Transitions** - Questions flow naturally
6. **Context Awareness** - AI stays silent while you're answering

---

## 🎓 Interview Tips

### With Voice AI:
1. **Speak at normal conversation pace** - AI handles it well
2. **Don't rush** - Take your time to think
3. **If interrupted** - AI stops speaking when you start recording
4. **Use Replay** - Hear question again if needed
5. **Practice makes perfect** - Try a test interview first

---

## 🆘 Need Help?

### Quick Diagnostic:

**Run in browser console (F12):**
```javascript
// Check if audio context is ready
console.log('Audio Context:', new AudioContext().state);

// Test TTS endpoint
fetch('http://localhost:8000/api/interview/text-to-speech?text=Hello&language=en-IN&speaker=kavya', {
  method: 'POST'
}).then(r => console.log('TTS Status:', r.status));
```

**Expected Output:**
```
Audio Context: running
TTS Status: 200
```

---

## 🎉 Success!

Your interview page is now fully functional with:
- ✅ Auto-speaking AI interviewer
- ✅ Human-like natural voice
- ✅ Accurate speech transcription
- ✅ Professional interview experience

**Ready to practice? Start an interview and experience it! 🚀**

---

## 📞 Support

If issues persist:
1. Check server console for errors
2. Check browser console (F12) for errors
3. Verify both API keys are valid
4. Restart both frontend and backend servers
5. Clear browser cache and reload

**Last Updated:** March 4, 2026
**Version:** 2.0 - Full Voice Integration
