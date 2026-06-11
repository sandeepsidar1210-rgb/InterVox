import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import FormData from 'form-data';
import fetch from 'node-fetch';
import path from 'path';

dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Setup Multer for audio uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for dev
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5002;

// Smart evaluation function for fallback scoring
function evaluateAnswerQuality(
  userAnswer: string,
  keywords: string[],
  role: string
) {
  const answer = userAnswer.trim().toLowerCase();

  // Empty or nil answer
  if (!answer || answer.length === 0) {
    return {
      final_score: 0,
      grade: 'F',
      keyword_coverage: 0,
      has_examples: false,
      has_metrics: false,
      structure_quality: 0,
      depth_score: 1,
      clarity_score: 1,
      strengths: ['Answer provided'],
      improvements: ['Please provide a detailed answer to your question']
    };
  }

  // Count keyword hits
  const keywordMatches = keywords.filter((kw) =>
    answer.includes(kw.toLowerCase())
  ).length;
  const keywordScore = Math.min(10, (keywordMatches / Math.max(keywords.length, 1)) * 10);

  // Check for examples/concrete evidence
  const examplePatterns = /example|project|implemented|built|designed|fixed|optimized|refactored|migrated|led|managed|developed|created|architected|delivered|improved/i;
  const has_examples = examplePatterns.test(answer);
  const exampleScore = has_examples ? 3.5 : 1;

  // Check for metrics/quantifiable results
  const metricsPattern = /(\d+%|\d+x|reduced|improved|increased|decreased|latency|throughput|response time|load|scale|performance|growth|users|requests|percentage|times|seconds|milliseconds)/i;
  const has_metrics = metricsPattern.test(answer);
  const metricsScore = has_metrics ? 3.5 : 1;

  // Check for trade-offs/considerations
  const hasTradeoffs = /trade-off|trade off|consideration|however|on the other hand|alternatively|instead|versus|compare|downside|pro|con|although/i.test(answer);
  const tradeoffScore = hasTradeoffs ? 2 : 0;

  // Length-based depth scoring (1-3 points)
  let depth_score = 1.5;
  if (answer.length > 80) depth_score = 2.5;
  if (answer.length > 200) depth_score = 3;
  if (answer.length > 400) depth_score = 3.5;

  // Clarity: Check sentence structure quality
  const sentences = answer.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgSentenceLength = answer.length / Math.max(sentences.length, 1);
  let clarity_score = 5;
  if (sentences.length >= 3 && avgSentenceLength < 150) clarity_score = 7;
  if (sentences.length >= 4 && avgSentenceLength < 120) clarity_score = 8;

  // Structure quality: Check for logical flow words
  const hasStructure = /first|second|then|next|finally|initially|additionally|furthermore|meanwhile|therefore|thus|as a result|in conclusion|because|due to|consequently/i.test(answer);
  const structureScore = hasStructure ? 3 : 1;

  // Calculate base scores
  const technicalScore = Math.min(10, keywordScore + structureScore);
  const examplesAndMetrics = exampleScore + metricsScore + (has_examples && has_metrics ? 1.5 : 0);
  const depthAndClarity = (depth_score + clarity_score) / 2;
  const completenessScore = Math.min(10, (depth_score * 1.5) + structureScore + tradeoffScore);

  // Weighted final score (now properly scales to 100)
  // Weight distribution: Examples matter a lot, then depth/clarity, keywords, structure
  const final_score = Math.round(
    (examplesAndMetrics * 0.30 +  // 30% - examples and metrics
     depthAndClarity * 0.25 +      // 25% - depth and clarity
     technicalScore * 0.20 +       // 20% - keywords and structure
     completenessScore * 0.25) *   // 25% - overall completeness
    10
  );

  // Clamp to 0-100
  const clamped_score = Math.max(0, Math.min(100, final_score));

  // Grade mapping
  let grade = 'F';
  if (clamped_score >= 90) grade = 'A';
  else if (clamped_score >= 80) grade = 'B';
  else if (clamped_score >= 70) grade = 'C';
  else if (clamped_score >= 60) grade = 'D';

  // Generate strengths
  const strengths: string[] = [];
  if (keywordScore >= 7) strengths.push('Strong coverage of key concepts');
  if (has_examples) strengths.push('Excellent use of concrete examples');
  if (has_metrics) strengths.push('Included relevant metrics and impact');
  if (depth_score >= 3) strengths.push('Great depth and comprehensive detail');
  if (clarity_score >= 7) strengths.push('Clear, well-structured response');
  if (hasTradeoffs) strengths.push('Demonstrated thoughtful analysis');
  if (strengths.length === 0) strengths.push('Answered the question');

  // Generate improvements
  const improvements: string[] = [];
  if (keywordScore < 7) improvements.push(`Include more key concepts like ${keywords.slice(0, Math.min(2, keywords.length)).join(', ')}`);
  if (!has_examples) improvements.push('Add specific real-world examples');
  if (!has_metrics) improvements.push('Quantify impact with specific numbers');
  if (depth_score < 2.5) improvements.push('Provide more context and detail');
  if (!hasTradeoffs) improvements.push('Discuss different approaches or trade-offs');
  if (clarity_score < 7) improvements.push('Improve sentence structure and flow');
  if (improvements.length === 0) improvements.push('Well done!');

  return {
    final_score: clamped_score,
    grade,
    keyword_coverage: keywordMatches,
    has_examples,
    has_metrics,
    structure_quality: structureScore,
    depth_score: Math.round(depth_score * 10) / 10,
    clarity_score: Math.round(clarity_score),
    strengths,
    improvements
  };
}

// Health check
app.get('/', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.sendFile(path.resolve(__dirname, '../../dist', 'index.html'));
  } else {
    res.send('InterVox Server is running');
  }
});

// Whisper Transcription API (using Groq)
app.post('/api/interview/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: 'No audio file provided' });
    }
    
    console.log('🎤 Received audio file for transcription:', req.file.originalname, req.file.size, 'bytes');
    
    const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
    
    // If no API key, return mock transcript
    if (!GROQ_API_KEY || GROQ_API_KEY === 'your-groq-api-key-here') {
      console.warn('⚠️ No Groq API key found - returning mock transcription');
      console.warn('⚠️ Add GROQ_API_KEY to .env file to enable real transcription');
      console.warn('⚠️ Get a free key from: https://console.groq.com/');
      return res.json({ 
        transcript: "[Mock transcription] This is a simulated transcription. Please add your GROQ_API_KEY to enable real speech-to-text." 
      });
    }

    // Call Groq Whisper API
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: 'audio.webm',
      contentType: req.file.mimetype,
    });
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'en');
    formData.append('response_format', 'json');

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('❌ Groq API error:', groqResponse.status, errorText);
      throw new Error(`Groq API error: ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    console.log('✅ Transcription successful:', groqData.text?.substring(0, 50) + '...');
    
    res.json({ transcript: groqData.text });
    
  } catch (error) {
    console.error('❌ Transcription error:', error);
    res.status(500).json({ detail: 'Transcription failed: ' + (error instanceof Error ? error.message : 'Unknown error') });
  }
});

// Helper function to generate smart reactions and cross-questions
function generateSmartReactionAndQuestion(lastAnswer: string, lastQuestion: string, difficulty: string, role: string, qaHistory: Array<{ question?: string; answer?: string }>) {
  const answer = lastAnswer.trim().toLowerCase();
  const reactions: string[] = [];
  let crossQuestion: string | null = null;

  if (!answer) {
    return { reaction: "Let's continue.", crossQuestion: null };
  }

  // Extract specific claims for cross-questioning with more patterns
  const metricsPatterns = [
    { pattern: /\b(my name is|i am|i'm|hello|hi\b|hey|greetings|introduce myself|nice to meet you)\b/i, keyword: 'introduction' },
    { pattern: /\b(not made any project|no projects|no project|haven't built any|never made any|no experience|don't have any project|don't have experience|didn't build any project|don't have projects|not built anything)\b/i, keyword: 'no_projects' },
    { pattern: /improved|optimized|reduced|increased|performance|latency|throughput|(\d+%)/, keyword: 'metrics' },
    { pattern: /led|managed|mentored|owned|architected/, keyword: 'leadership' },
    { pattern: /challenge|difficult|complex|issue|bug|problem|failure|incident|outage|critical/, keyword: 'challenge' },
    { pattern: /(kubernetes|docker|microservices|aws|gcp|azure|sql|nosql|mongodb|postgres|react|node|python|java|go|rust)/, keyword: 'technology' },
    { pattern: /trade-off|trade off|alternatives?|instead of|versus|compared to|considered/, keyword: 'tradeoff' }
  ];

  // Score the answer against patterns
  let highestPattern = null;
  for (const { pattern, keyword } of metricsPatterns) {
    if (pattern.test(answer)) {
      highestPattern = keyword;
      break; // Stop at first match (ordered by importance)
    }
  }

  // Generate contextual reactions based on answer quality
  if (highestPattern === 'introduction') {
    reactions.push("Nice to meet you! Thanks for introducing yourself.");
  } else if (highestPattern === 'no_projects') {
    reactions.push("I understand. It can be challenging to start without formal project experience.");
  } else if (answer.length > 300) {
    reactions.push("I appreciate the thoughtful depth in that answer.");
  } else if (answer.length > 150) {
    reactions.push("That's a comprehensive response.");
  } else if (answer.length < 30) {
    reactions.push("Can you elaborate a bit more on that?");
  } else {
    reactions.push("Good, thanks for that context.");
  }

  // Generate cross-questions based on detected patterns
  if (highestPattern === 'introduction') {
    reactions.unshift("Hello! It's great to have you here today.");
    crossQuestion = null;
  } else if (highestPattern === 'no_projects') {
    reactions.unshift("I see. Starting out without formal projects is a common stage in any developer's path.");
    crossQuestion = `If you were to design and build your first full-stack application today, what kind of application would you want to build and how would you plan your approach?`;
  } else if (highestPattern === 'metrics') {
    reactions.unshift("That shows focus on measurable impact - I like that.");
    // Ask about the baseline/measurement method
    const numberMatch = answer.match(/(\d+%|\d+x)/);
    if (numberMatch) {
      crossQuestion = `When you mention that improvement, how did you measure it? What was your starting point or baseline?`;
    } else {
      crossQuestion = `What metrics did you use to measure that improvement? How do you typically track success?`;
    }
  } else if (highestPattern === 'leadership') {
    reactions.unshift("That demonstrates strong ownership and leadership.");
    // Ask about team dynamics or specific outcomes
    if (/led|managed/.test(answer)) {
      crossQuestion = `When you led that effort, what was the biggest challenge with the team or stakeholders, and how did you handle it?`;
    } else if (/mentored|coached/.test(answer)) {
      crossQuestion = `Tell me about someone you mentored. What was their growth, and how did you measure your impact as a mentor?`;
    } else {
      crossQuestion = `What was the most difficult decision you had to make while owning that responsibility?`;
    }
  } else if (highestPattern === 'challenge') {
    reactions.unshift("I like how you handled that difficult situation.");
    // Ask about lessons learned
    if (/incident|outage|failure|critical/.test(answer)) {
      crossQuestion = `Looking back at that incident, what would you do differently if it happened again? What did the team learn?`;
    } else {
      crossQuestion = `How did you approach solving that complex problem? What was your methodology?`;
    }
  } else if (highestPattern === 'technology') {
    const techMatch = answer.match(/(kubernetes|docker|microservices|aws|gcp|azure|sql|nosql|mongodb|postgres|react|node|python|java|go|rust)/i);
    if (techMatch) {
      const tech = techMatch[1];
      reactions.unshift(`Good knowledge of ${tech}!`);
      crossQuestion = `Have you had to troubleshoot or debug issues with ${tech} in production? Walk me through one specific situation.`;
    }
  } else if (highestPattern === 'tradeoff') {
    reactions.unshift("Excellent - you're thinking about trade-offs like a senior engineer.");
    crossQuestion = `Given what you know now, would you make the same decision again? Are there any dimensions you'd reconsider?`;
  }

  // Pick a reaction (prefer the more specific one if multiple were added)
  let selectedReaction = reactions[0] || 'Good answer.';
  
  // Add a bit of variety if no specific pattern matched
  if (!highestPattern) {
    const genericReactions = [
      'Thank you for that context.',
      'That makes sense.',
      'Interesting approach.',
      'I appreciate the detail.',
      'That\'s helpful to know.'
    ];
    selectedReaction = genericReactions[Math.floor(Math.random() * genericReactions.length)];
  }

  return { reaction: selectedReaction, crossQuestion };
}

// Core async function to generate dynamic questions (using OpenAI with Groq fallback)
async function generateQuestionInternal(
  role: string,
  difficulty: string,
  previous_qa: Array<{ question: string; answer: string }>,
  use_ai: boolean = true
): Promise<any> {
  const normalizedRole = String(role || 'software_engineer').replace('_', ' ');
  const qaHistory = (Array.isArray(previous_qa) ? previous_qa : []) as Array<{ question?: string; answer?: string }>;

  const buildFallbackQuestion = () => {
    const askedQuestions = new Set(
      qaHistory
        .map((qa) => String(qa.question || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const lastAnswer = String(qaHistory[qaHistory.length - 1]?.answer || '').trim();
    const lastQuestion = String(qaHistory[qaHistory.length - 1]?.question || '').trim();
    
    const { reaction, crossQuestion } = generateSmartReactionAndQuestion(lastAnswer, lastQuestion, difficulty, normalizedRole, qaHistory);

    // If we generated a smart cross-question, use it first (deep dive into their answer)
    if (crossQuestion && qaHistory.length > 1) {
      return {
        question: crossQuestion,
        ideal_answer: 'A strong answer should provide concrete examples and explain your thought process.',
        keywords: ['example', 'explanation', 'outcome', 'learning', 'decision'],
        reaction,
        role,
        difficulty,
        is_cross_question: true
      };
    }

    const easyBank = [
      {
        question: `What project are you most proud of as a ${normalizedRole}, and why?`,
        ideal_answer: 'A strong answer explains the project context, your specific contribution, constraints, and measurable business outcome.',
        keywords: ['project', 'ownership', 'impact', 'outcome', 'contribution']
      },
      {
        question: 'How do you break down a large task when requirements are unclear?',
        ideal_answer: 'A strong answer includes clarification steps, prioritization, assumptions, milestones, and stakeholder communication.',
        keywords: ['clarification', 'prioritization', 'milestones', 'communication', 'planning']
      },
      {
        question: 'Describe a time you received critical feedback. What changed after that?',
        ideal_answer: 'A strong answer includes openness to feedback, concrete changes made, and measurable improvement over time.',
        keywords: ['feedback', 'growth', 'improvement', 'reflection', 'results']
      },
      {
        question: `Tell me about a ${normalizedRole} task that tested your problem-solving skills.`,
        ideal_answer: 'A strong answer includes the problem context, your approach, challenges overcome, and the final result.',
        keywords: ['problem', 'approach', 'solution', 'testing', 'analysis']
      },
      {
        question: 'How do you stay current with new technologies in your field?',
        ideal_answer: 'A strong answer shows commitment to learning with specific examples like courses, projects, or communities.',
        keywords: ['learning', 'technologies', 'growth', 'initiative', 'examples']
      }
    ];

    const mediumBank = [
      {
        question: `Walk me through a technical decision you made recently and the trade-offs you considered.`,
        ideal_answer: 'A strong answer covers options considered, decision criteria, trade-offs, implementation details, and outcome.',
        keywords: ['trade-offs', 'decision', 'alternatives', 'implementation', 'outcome']
      },
      {
        question: 'How do you debug a production issue when logs are incomplete?',
        ideal_answer: 'A strong answer includes reproduction strategy, hypothesis testing, observability improvements, and rollback safety.',
        keywords: ['debugging', 'hypothesis', 'observability', 'rollback', 'incident']
      },
      {
        question: 'How do you ensure your code remains maintainable as the system grows?',
        ideal_answer: 'A strong answer includes testing strategy, code reviews, modularity, documentation, and refactoring discipline.',
        keywords: ['testing', 'modularity', 'reviews', 'documentation', 'refactoring']
      },
      {
        question: 'Describe a time when you had to collaborate with a challenging team member.',
        ideal_answer: 'A strong answer shows empathy, communication, and focus on shared goals rather than blame.',
        keywords: ['collaboration', 'communication', 'resolution', 'empathy', 'teamwork']
      },
      {
        question: 'How would you approach optimizing a slow-running system?',
        ideal_answer: 'A strong answer starts with measurement, includes profiling strategy, and discusses trade-offs.',
        keywords: ['profiling', 'optimization', 'measurement', 'bottleneck', 'improvement']
      }
    ];

    const hardBank = [
      {
        question: 'Design a resilient architecture for a high-traffic service and explain failure handling.',
        ideal_answer: 'A strong answer includes scaling strategy, bottleneck analysis, caching, retries, circuit breakers, and monitoring.',
        keywords: ['scalability', 'resilience', 'caching', 'retries', 'monitoring']
      },
      {
        question: 'Describe how you would reduce latency in a system with mixed read/write workloads.',
        ideal_answer: 'A strong answer includes profiling, query optimization, caching strategy, async processing, and measurement.',
        keywords: ['latency', 'profiling', 'optimization', 'caching', 'throughput']
      },
      {
        question: 'How would you lead a critical migration with near-zero downtime?',
        ideal_answer: 'A strong answer includes rollout strategy, feature flags, backward compatibility, monitoring, and rollback plans.',
        keywords: ['migration', 'rollout', 'compatibility', 'rollback', 'risk']
      },
      {
        question: 'Tell me about a time you made a critical decision that had long-term consequences.',
        ideal_answer: 'A strong answer reflects thoughtfulness about impact, learning from outcomes, and ownership.',
        keywords: ['decision', 'impact', 'ownership', 'reflection', 'learning']
      },
      {
        question: 'How do you balance technical excellence with shipping on deadline?',
        ideal_answer: 'A strong answer shows pragmatism, prioritization, and realistic assessment of trade-offs.',
        keywords: ['prioritization', 'trade-off', 'pragmatism', 'deadline', 'quality']
      }
    ];

    const bank = difficulty === 'hard' ? hardBank : difficulty === 'easy' ? easyBank : mediumBank;
    
    // Find a question that hasn't been asked yet
    let nextQuestion = null;
    for (const question of bank) {
      if (!askedQuestions.has(question.question.trim().toLowerCase())) {
        nextQuestion = question;
        break;
      }
    }
    
    // Fallback if all questions have been asked
    if (!nextQuestion) {
      nextQuestion = bank[qaHistory.length % bank.length];
    }

    return {
      ...nextQuestion,
      reaction,
      role,
      difficulty
    };
  };

  console.log('🎯 Generating question internally:', { role, difficulty, previous_qa_count: qaHistory.length, use_ai });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

  // If no API key or use_ai is false, return mock question
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key-here' || !use_ai) {
    console.warn('⚠️ No OpenAI API key or use_ai=false - returning mock question');
    return buildFallbackQuestion();
  }

  // Build AI prompt for context-aware question generation
  let contextPrompt = `You are conducting a live, interactive technical interview for a ${role} position.
Your tone should be professional, encouraging, warm, and highly engaging.

Generate a ${difficulty} difficulty interview question.`;

  if (qaHistory && qaHistory.length > 0) {
    const lastQAIndex = qaHistory.length - 1;
    const lastQA = qaHistory[lastQAIndex];

    contextPrompt += `\n\nPrevious interview context:\n`;
    qaHistory.slice(-3).forEach((qa: any, i: number) => {
      contextPrompt += `Q${i+1}: ${qa.question}\nA${i+1}: ${qa.answer}\n\n`;
    });

    contextPrompt += `
Based on the candidate's last answer ("${lastQA.answer}"), follow these critical instructions for the "reaction" and the next "question":

1. EVALUATE THE ANSWER QUALITY:
   - Identify if the answer was strong, detailed, brief, vague, incorrect, or a simple greeting/introduction/name introduction.
   - If they just stated their name or introduced themselves (e.g. "My name is Sandeep"), greet them warmly and naturally (e.g., "Nice to meet you, Sandeep! Let's dive in..."). Do NOT say "Interesting approach" or "Nice approach" to an introduction.
   - If their answer was strong, compliment them specifically on their approach, reasoning, or metrics (e.g., "That's a very solid way to optimize that database query. I like how you analyzed the index trade-offs.").
   - If their answer was weak, brief, or missed key details, politely critique it or highlight the gaps (e.g., "Thanks for that brief overview. You mentioned using a cache, but didn't touch on cache invalidation...").

2. DECIDE ON A FOLLOW-UP OR NEW QUESTION:
   - If their last answer created a "situation", left a "hole", or contained interesting claims/technologies, ask a specific follow-up question (cross-question) digging deeper into that claim (e.g. asking how they handled a specific challenge they mentioned, or how they resolved the gap you highlighted).
   - If their last answer was fully complete and resolved, transition smoothly and ask a new relevant question corresponding to the ${difficulty} difficulty and ${role} role.

3. WRITE A CONVERSATIONAL "reaction":
   - The "reaction" string must contain ONLY your natural verbal response to their last answer (e.g., your greeting, compliment, or constructive critique), transitioning smoothly to the next question.
   - The "reaction" should NOT repeat the next question itself. It will be spoken first, followed immediately by the "question".
   - Keep the reaction concise (1-2 sentences), warm, and natural. Avoid generic/monotone replies like "Interesting approach" or "Nice approach" unless they actually explained a specific approach.`;
  } else {
    contextPrompt += `\n\nThis is the beginning of the interview. Since there are no previous answers, the "reaction" field should be empty or a brief warm welcome.`;
  }

  contextPrompt += `\n\nRespond ONLY in JSON format:
{
  "reaction": "your verbal feedback/greeting to their previous answer, transitioning to the next question (empty if first question)",
  "question": "the next interview question (either a follow-up/cross-question or a new question)",
  "is_follow_up": true or false,
  "ideal_answer": "what a strong answer would include",
  "keywords": ["key", "concepts", "to", "look", "for"],
  "role": "${role}",
  "difficulty": "${difficulty}"
}`;

  let content = "";
  let provider = "OpenAI";

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an expert technical interviewer. Always respond with valid JSON.' },
          { role: 'user', content: contextPrompt }
        ],
        temperature: 0.8,
        max_tokens: 600,
      }),
    });

    if (openaiResponse.ok) {
      const openaiData = await openaiResponse.json();
      content = openaiData.choices[0].message.content;
    } else {
      const errorText = await openaiResponse.text();
      console.warn('⚠️ OpenAI API failed. Trying Groq fallback...', openaiResponse.status, errorText);
      throw new Error(`OpenAI API failed with status ${openaiResponse.status}`);
    }
  } catch (openaiError: any) {
    console.warn('⚠️ OpenAI failed. Checking for Groq key...', openaiError.message || openaiError);
    
    const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
    if (GROQ_API_KEY && GROQ_API_KEY !== 'your-groq-api-key-here') {
      try {
        console.log('📡 Calling Groq fallback Chat Completions API...');
        provider = "Groq";
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              { role: 'system', content: 'You are an expert technical interviewer. Always respond with valid JSON.' },
              { role: 'user', content: contextPrompt }
            ],
            temperature: 0.8,
            max_tokens: 600,
            response_format: { type: "json_object" }
          }),
        });

        if (groqResponse.ok) {
          const groqData = await groqResponse.json();
          content = groqData.choices[0].message.content;
          console.log('✅ Groq response received successfully!');
        } else {
          const errorText = await groqResponse.text();
          console.error('❌ Groq API error:', groqResponse.status, errorText);
          throw new Error(`Groq API failed with status ${groqResponse.status}`);
        }
      } catch (groqError: any) {
        console.error('❌ Groq fallback also failed:', groqError.message || groqError);
        return buildFallbackQuestion();
      }
    } else {
      console.error('❌ No Groq API key configured for fallback.');
      return buildFallbackQuestion();
    }
  }

  // Parse JSON response
  try {
    const questionData = JSON.parse(content);
    console.log(`✅ Question generated using ${provider}:`, questionData.question);

    let reaction = questionData.reaction;
    if (!reaction || reaction.trim() === '') {
      const lastAnswer = String(qaHistory[qaHistory.length - 1]?.answer || '').trim();
      const lastQuestion = String(qaHistory[qaHistory.length - 1]?.question || '').trim();
      const fallbackObj = generateSmartReactionAndQuestion(lastAnswer, lastQuestion, difficulty, normalizedRole, qaHistory);
      reaction = fallbackObj.reaction;
    }
    
    return {
      ...questionData,
      reaction
    };
  } catch (parseErr) {
    console.error('❌ JSON parsing failed for dynamic question, using fallback.', content);
    return buildFallbackQuestion();
  }
}

// Core async function to evaluate candidate answer (using OpenAI with Groq fallback)
async function evaluateAnswerInternal(
  question: string,
  user_answer: string,
  ideal_answer: string,
  keywords: string[],
  role: string
): Promise<any> {
  console.log('📊 Evaluating answer internally for role:', role);
  console.log('   Question:', question.substring(0, 60) + '...');
  console.log('   Answer length:', user_answer.length, 'chars');

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

  // Helper to fallback to rule-based evaluation
  const buildFallbackEvaluation = () => {
    const evaluation = evaluateAnswerQuality(user_answer, keywords || [], role);
    return {
      final_score: evaluation.final_score,
      grade: evaluation.grade,
      score_breakdown: {
        technical_accuracy: Math.round(evaluation.keyword_coverage / Math.max(keywords?.length || 1, 1) * 10),
        depth_of_knowledge: Math.round(evaluation.depth_score),
        clarity_score: Math.round(evaluation.clarity_score),
        completeness: Math.round((evaluation.depth_score + evaluation.structure_quality) / 2),
        example_quality: evaluation.has_examples ? 8 : 4
      },
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      feedback: `Score: ${evaluation.final_score}%. ${evaluation.has_examples ? 'Good use of examples. ' : ''}${evaluation.has_metrics ? 'Strong metrics provided. ' : ''}${evaluation.improvements[0] ? `To improve: ${evaluation.improvements[0].toLowerCase()}.` : 'Well done!'}`,
      keyword_coverage: evaluation.keyword_coverage
    };
  };

  // If no API key, return mock evaluation
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key-here') {
    console.warn('⚠️ No OpenAI API key - returning smart evaluation');
    return buildFallbackEvaluation();
  }

  // Build evaluation prompt
  const evalPrompt = `Evaluate this ${role} interview answer:

Question: ${question}

Candidate's Answer: ${user_answer}

Ideal Answer Guide: ${ideal_answer}

Key Concepts: ${keywords.join(', ')}

Provide a detailed evaluation in JSON format:
{
  "final_score": <number 0-100>,
  "grade": "<letter grade A-F>",
  "score_breakdown": {
    "technical_accuracy": <number 1-10>,
    "depth_of_knowledge": <number 1-10>,
    "clarity_score": <number 1-10>,
    "completeness": <number 1-10>,
    "example_quality": <number 1-10>
  },
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "feedback": "detailed constructive feedback",
  "keyword_coverage": <count of keywords covered>
}`;

  let content = "";
  let provider = "OpenAI";

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an expert technical interviewer evaluating candidates. Be fair but thorough. Always respond with valid JSON.' },
          { role: 'user', content: evalPrompt }
        ],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (openaiResponse.ok) {
      const openaiData = await openaiResponse.json();
      content = openaiData.choices[0].message.content;
    } else {
      const errorText = await openaiResponse.text();
      console.warn('⚠️ OpenAI evaluate API failed. Trying Groq fallback...', openaiResponse.status, errorText);
      throw new Error(`OpenAI API failed with status ${openaiResponse.status}`);
    }
  } catch (openaiError: any) {
    console.warn('⚠️ OpenAI evaluate failed. Checking for Groq key...', openaiError.message || openaiError);
    
    const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
    if (GROQ_API_KEY && GROQ_API_KEY !== 'your-groq-api-key-here') {
      try {
        console.log('📡 Calling Groq fallback Chat Completions API for evaluation...');
        provider = "Groq";
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              { role: 'system', content: 'You are an expert technical interviewer evaluating candidates. Be fair but thorough. Always respond with valid JSON.' },
              { role: 'user', content: evalPrompt }
            ],
            temperature: 0.7,
            max_tokens: 800,
            response_format: { type: "json_object" }
          }),
        });

        if (groqResponse.ok) {
          const groqData = await groqResponse.json();
          content = groqData.choices[0].message.content;
          console.log('✅ Groq response received successfully for evaluation!');
        } else {
          const errorText = await groqResponse.text();
          console.error('❌ Groq evaluate API error:', groqResponse.status, errorText);
          throw new Error(`Groq API failed with status ${groqResponse.status}`);
        }
      } catch (groqError: any) {
        console.error('❌ Groq evaluate fallback also failed:', groqError.message || groqError);
        return buildFallbackEvaluation();
      }
    } else {
      return buildFallbackEvaluation();
    }
  }

  try {
    const evaluation = JSON.parse(content);
    console.log(`✅ Evaluation complete (${provider}) - Score:`, evaluation.final_score, 'Grade:', evaluation.grade);
    return evaluation;
  } catch (parseErr) {
    console.error('❌ JSON parsing failed for dynamic evaluation, using fallback.', content);
    return buildFallbackEvaluation();
  }
}

// Core async function to transcribe WebM audio buffer using Groq Whisper API
async function transcribeAudioInternal(audioBuffer: Buffer, mimeType: string = 'audio/webm'): Promise<string> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  if (!GROQ_API_KEY || GROQ_API_KEY === 'your-groq-api-key-here') {
    console.warn('⚠️ No Groq API key configured - returning empty transcript');
    return "";
  }

  console.log('📡 Calling Groq Whisper API for transcription internally...');
  const formData = new FormData();
  formData.append('file', audioBuffer, {
    filename: 'audio.webm',
    contentType: mimeType,
  });
  formData.append('model', 'whisper-large-v3');
  formData.append('language', 'en');
  formData.append('response_format', 'json');

  const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      ...formData.getHeaders(),
    },
    body: formData,
  });

  if (!groqResponse.ok) {
    const errorText = await groqResponse.text();
    console.error('❌ Groq transcribe API error internally:', groqResponse.status, errorText);
    throw new Error(`Groq transcription failed with status ${groqResponse.status}`);
  }

  const groqData = await groqResponse.json();
  return groqData.text || '';
}

// Generate Question API (REST Endpoint)
app.post('/api/interview/generate-question', async (req, res) => {
  try {
    const { role, difficulty, previous_qa, use_ai } = req.body;
    const result = await generateQuestionInternal(role, difficulty, previous_qa, use_ai);
    res.json(result);
  } catch (error) {
    console.error('❌ REST generate-question error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Evaluate Answer API (REST Endpoint)
app.post('/api/interview/evaluate', async (req, res) => {
  try {
    const { question, user_answer, ideal_answer, keywords, role } = req.body;
    const result = await evaluateAnswerInternal(question, user_answer, ideal_answer, keywords, role);
    res.json(result);
  } catch (error) {
    console.error('❌ REST evaluate error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.post('/api/interview/evaluate-answer-comprehensive', async (req, res) => {
  // Just forward to the main evaluate endpoint
  try {
    const { question, user_answer, ideal_answer, keywords, role } = req.body;

    console.log('📊 Comprehensive evaluation requested (forwarding to evaluate)');

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

    // If no API key, return mock evaluation
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key-here') {
      console.warn('⚠️ No OpenAI API key - returning smart evaluation');
      const evaluation = evaluateAnswerQuality(user_answer, keywords || [], role);
      console.log(`✅ Smart comprehensive evaluation score: ${evaluation.final_score}% (Grade: ${evaluation.grade})`);
      return res.json({
        final_score: evaluation.final_score,
        grade: evaluation.grade,
        score_breakdown: {
          embedding_score: Math.round((evaluation.keyword_coverage / Math.max(keywords?.length || 1, 1)) * 10 * 10) / 10,
          keyword_score: Math.round((evaluation.keyword_coverage / Math.max(keywords?.length || 1, 1)) * 10 * 10) / 10,
          technical_accuracy: Math.round(evaluation.keyword_coverage / Math.max(keywords?.length || 1, 1) * 10),
          clarity_score: Math.round(evaluation.clarity_score),
          depth_score: Math.round(evaluation.depth_score * 10) / 10
        },
        missing_concepts: evaluation.improvements,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements
      });
    }

    // Build evaluation prompt
    const evalPrompt = `Evaluate this ${role} interview answer:

Question: ${question}

Candidate's Answer: ${user_answer}

Ideal Answer Guide: ${ideal_answer}

Key Concepts: ${keywords.join(', ')}

Provide a detailed evaluation in JSON format:
{
  "final_score": <number 0-100>,
  "grade": "<letter grade A-F>",
  "score_breakdown": {
    "embedding_score": <1-10>,
    "keyword_score": <1-10>,
    "technical_accuracy": <1-10>,
    "clarity_score": <1-10>,
    "depth_score": <1-10>
  },
  "missing_concepts": ["concept 1", "concept 2"],
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"]
}`;

    // Call OpenAI API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an expert technical interviewer evaluating candidates. Be fair but thorough. Always respond with valid JSON.' },
          { role: 'user', content: evalPrompt }
        ],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', openaiResponse.status, errorText);

      const evaluation = evaluateAnswerQuality(user_answer, keywords || [], role);
      return res.json({
        final_score: evaluation.final_score,
        grade: evaluation.grade,
        score_breakdown: {
          embedding_score: Math.round((evaluation.keyword_coverage / Math.max(keywords?.length || 1, 1)) * 10 * 10) / 10,
          keyword_score: Math.round((evaluation.keyword_coverage / Math.max(keywords?.length || 1, 1)) * 10 * 10) / 10,
          technical_accuracy: Math.round(evaluation.keyword_coverage / Math.max(keywords?.length || 1, 1) * 10),
          clarity_score: Math.round(evaluation.clarity_score),
          depth_score: Math.round(evaluation.depth_score * 10) / 10
        },
        missing_concepts: evaluation.improvements,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements
      });
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices[0].message.content;

    // Parse JSON response
    const evaluation = JSON.parse(content);
    console.log('✅ Comprehensive evaluation complete - Score:', evaluation.final_score);

    res.json(evaluation);

  } catch (error) {
    console.error('❌ Comprehensive evaluation error:', error);
    const evaluation = evaluateAnswerQuality(
      (req.body?.user_answer || '').toString(),
      (req.body?.keywords || []) as string[],
      (req.body?.role || 'software_engineer').toString()
    );
    res.json({
      final_score: evaluation.final_score,
      grade: evaluation.grade,
      score_breakdown: {
        embedding_score: Math.round((evaluation.keyword_coverage / Math.max((req.body?.keywords?.length || 1), 1)) * 10 * 10) / 10,
        keyword_score: Math.round((evaluation.keyword_coverage / Math.max((req.body?.keywords?.length || 1), 1)) * 10 * 10) / 10,
        technical_accuracy: Math.round(evaluation.keyword_coverage / Math.max((req.body?.keywords?.length || 1), 1) * 10),
        clarity_score: Math.round(evaluation.clarity_score),
        depth_score: Math.round(evaluation.depth_score * 10) / 10
      },
      missing_concepts: evaluation.improvements,
      strengths: evaluation.strengths,
      improvements: evaluation.improvements
    });
  }
});

// Helper for fallback conversation classification and responses
function fallbackConverse(question: string, userInput: string) {
  const input = userInput.trim().toLowerCase();
  
  // Regex patterns for repeat
  const repeatPatterns = /repeat|pardon|say again|replay|could you repeat|didn't hear|missed the question/i;
  
  // Regex patterns for clarification / social remarks
  const socialPatterns = /thank you|thanks|hello|hi\b|hey|good morning|good afternoon|good evening|wow|interesting|difficult|tough/i;
  const clarifyPatterns = /clarify|what do you mean|explain|definition|define|understand/i;

  if (repeatPatterns.test(input)) {
    return {
      type: 'repeat',
      reply: `Sure, let me repeat the question for you: "${question}"`
    };
  }

  if (socialPatterns.test(input) || clarifyPatterns.test(input)) {
    let reply = `No problem. `;
    if (/thank/i.test(input)) {
      reply = `You're welcome! `;
    } else if (/hello|hi/i.test(input)) {
      reply = `Hello! `;
    }
    
    return {
      type: 'clarification',
      reply: `${reply}Let's focus on the question: "${question}"`
    };
  }

  // Otherwise, treat as an answer
  return {
    type: 'answer',
    reply: null
  };
}

// Conversation Classification API
app.post('/api/interview/converse', async (req, res) => {
  try {
    const { question, user_input, role, difficulty } = req.body;
    
    console.log('💬 Classifying user input for interview conversation...');
    console.log('   Question:', question?.substring(0, 60) + '...');
    console.log('   User Input:', user_input);

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

    const prompt = `Analyze the candidate's input in response to the active interview question.

Active Question: "${question}"
Candidate Input: "${user_input}"
Job Role: "${role}"
Difficulty: "${difficulty}"

Classify the candidate's input into one of three types:
1. "answer": The candidate is attempting to answer the question, even if it is a short or partial answer.
2. "repeat": The candidate is asking to repeat the question or didn't hear/understand it (e.g., "can you repeat?", "what was the question?", "pardon?", "say again").
3. "clarification": The candidate is asking for clarification about a term in the question, or making a polite/social/unrelated comment (e.g., "thank you", "hello", "interesting", "that's a tough one", "what do you mean by X?").

If the classification is "repeat" or "clarification", generate a conversational "reply" that the interviewer (you) should say back to the candidate. This reply should address their query/remark politely and then restate or clarify the original question. Keep it natural, warm, and professional, and use a friendly Indian English conversational style where appropriate (but keep the language standard English). Do not use placeholders.

If the classification is "answer", the "reply" field can be empty or null.

Respond ONLY in JSON format:
{
  "type": "answer" | "repeat" | "clarification",
  "reply": "Conversational response to candidate, followed by restating the question if type is repeat or clarification. Otherwise null."
}`;

    let content = "";
    let provider = "OpenAI";

    try {
      if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key-here') {
        throw new Error("No OpenAI API key configured");
      }

      // Call OpenAI GPT-3.5 to classify and respond
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are an expert technical interviewer. Always respond with valid JSON.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 300,
        }),
      });

      if (openaiResponse.ok) {
        const openaiData = await openaiResponse.json();
        content = openaiData.choices[0].message.content;
      } else {
        const errorText = await openaiResponse.text();
        console.warn('⚠️ OpenAI converse API failed. Trying Groq fallback...', openaiResponse.status, errorText);
        throw new Error(`OpenAI API failed with status ${openaiResponse.status}`);
      }
    } catch (openaiError: any) {
      console.warn('⚠️ OpenAI converse failed. Checking for Groq key...', openaiError.message || openaiError);
      
      const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
      if (GROQ_API_KEY && GROQ_API_KEY !== 'your-groq-api-key-here') {
        try {
          console.log('📡 Calling Groq fallback Chat Completions API for converse classification...');
          provider = "Groq";
          const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant',
              messages: [
                { role: 'system', content: 'You are an expert technical interviewer. Always respond with valid JSON.' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.7,
              max_tokens: 300,
              response_format: { type: "json_object" }
            }),
          });

          if (groqResponse.ok) {
            const groqData = await groqResponse.json();
            content = groqData.choices[0].message.content;
            console.log('✅ Groq response received successfully for converse classification!');
          } else {
            const errorText = await groqResponse.text();
            console.error('❌ Groq converse API error:', groqResponse.status, errorText);
            throw new Error(`Groq API failed with status ${groqResponse.status}`);
          }
        } catch (groqError: any) {
          console.error('❌ Groq converse fallback also failed:', groqError.message || groqError);
          const fallbackResult = fallbackConverse(question || '', user_input || '');
          return res.json(fallbackResult);
        }
      } else {
        console.error('❌ No Groq API key configured for fallback converse.');
        const fallbackResult = fallbackConverse(question || '', user_input || '');
        return res.json(fallbackResult);
      }
    }

    const result = JSON.parse(content);
    
    console.log(`✅ Classification (${provider}): ${result.type}`);
    if (result.reply) {
      console.log(`   Reply: "${result.reply}"`);
    }
    
    res.json(result);
  } catch (error) {
    console.error('❌ Conversation classification error:', error);
    const fallbackResult = fallbackConverse(req.body.question || '', req.body.user_input || '');
    res.json(fallbackResult);
  }
});

// Mock Text-to-Speech API (Now with Sarvam AI integration)
app.post('/api/interview/text-to-speech', async (req, res) => {
  try {
    const { text, language, speaker } = req.query;
    
    console.log('Received TTS request:', { text, language, speaker });

    const SARVAM_API_KEY = process.env.SARVAM_API_KEY || '';
    
    // If no API key, return mock audio
    if (!SARVAM_API_KEY || SARVAM_API_KEY === 'your-sarvam-api-key-here') {
      console.warn('⚠️ No Sarvam API key found - returning mock audio');
      console.warn('⚠️ Add SARVAM_API_KEY to .env file to enable real TTS');
      
      // Return a minimal valid MP3 header
      const dummyMp3 = Buffer.from([
        0xFF, 0xFB, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]);
      res.set('Content-Type', 'audio/mpeg');
      return res.send(dummyMp3);
    }

    // Call Sarvam AI API with optimized settings for natural interview voice
    const sarvamResponse = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Subscription-Key': SARVAM_API_KEY,
      },
      body: JSON.stringify({
        inputs: [String(text)],
        target_language_code: String(language) || 'en-IN',
        speaker: String(speaker) || 'kavya', // Kavya sounds more professional
        pace: 0.95, // Slightly slower for clarity
        speech_sample_rate: 22050, // High quality audio
        enable_preprocessing: true, // Better text normalization
        model: 'bulbul:v3' // Latest model version
      }),
    });

    if (!sarvamResponse.ok) {
      const errorText = await sarvamResponse.text();
      console.error('Sarvam AI API error:', sarvamResponse.status, errorText);
      throw new Error(`Sarvam AI error: ${sarvamResponse.status}`);
    }

    const sarvamData = await sarvamResponse.json();
    
    // Sarvam returns base64 audio in 'audios' array
    if (sarvamData.audios && sarvamData.audios.length > 0) {
      const audioBase64 = sarvamData.audios[0];
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      
      console.log('✅ Sarvam AI TTS generated:', audioBuffer.length, 'bytes');
      
      res.set('Content-Type', 'audio/mpeg');
      res.send(audioBuffer);
    } else {
      throw new Error('No audio returned from Sarvam AI');
    }

  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).send('TTS failed');
  }
});

// Define state structure for voice interview
interface VoiceInterviewState {
  config: {
    userId: string;
    interviewId: string;
    jobRole: string;
    interviewType: string;
    difficulty: string;
    maxQuestions: number;
  };
  questionsAsked: number;
  previous_qa: Array<{ question: string; answer: string }>;
  evaluations: any[];
  currentQuestion: {
    question: string;
    ideal_answer: string;
    keywords: string[];
    role: string;
    difficulty: string;
    reaction?: string;
  };
  audioChunks: Buffer[];
}

const voiceInterviews = new Map<string, VoiceInterviewState>();

function generateFinalReport(previous_qa: Array<{ question: string; answer: string }>, evaluations: any[]) {
  const scores = evaluations.map(e => e.final_score || e.score || 0);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  
  let grade = 'F';
  if (avgScore >= 90) grade = 'A';
  else if (avgScore >= 80) grade = 'B';
  else if (avgScore >= 70) grade = 'C';
  else if (avgScore >= 60) grade = 'D';

  const strengths = Array.from(new Set(evaluations.flatMap(e => e.strengths || []))).slice(0, 5);
  const weaknesses = Array.from(new Set(evaluations.flatMap(e => e.improvements || []))).slice(0, 5);
  
  const sectionScores = {
    technical: Math.round(avgScore * 0.95),
    communication: Math.round(avgScore * 0.92),
    confidence: Math.round(avgScore * 0.88),
    problemSolving: Math.round(avgScore * 0.90),
    clarity: Math.round(avgScore * 0.94)
  };

  const improvementPlan = weaknesses.map((w) => `Focus on: ${w}`);
  if (improvementPlan.length === 0) {
    improvementPlan.push("Continue practicing technical explanations and structure.");
  }

  return {
    overallScore: avgScore,
    grade,
    sectionScores,
    strengths: strengths.length > 0 ? strengths : ["Answered questions clearly"],
    weaknesses: weaknesses.length > 0 ? weaknesses : ["Add more details to technical answers"],
    detailedQuestionAnalysis: evaluations,
    improvementPlan
  };
}

// Voice Interview Namespace
// Note: Frontend connects via `io('${WS_URL}/voice-interview')`
// This creates a connection to the /voice-interview namespace.
const voiceInterviewNamespace = io.of('/voice-interview');

voiceInterviewNamespace.on('connection', (socket) => {
  console.log('Client connected to /voice-interview namespace:', socket.id);

  // Handle Init Event
  socket.on('init-voice-interview', async (config) => {
    console.log('Received init-voice-interview:', config);
    
    const firstQuestion = {
      question: "Tell me about yourself and your background.",
      ideal_answer: "A strong answer should include: your current role and experience, relevant technical skills, notable achievements or projects, and what motivates you professionally.",
      keywords: ["experience", "background", "skills", "expertise", "achievements", "passion", "goals"],
      role: config.jobRole || 'software_engineer',
      difficulty: 'easy',
      reaction: ''
    };

    voiceInterviews.set(socket.id, {
      config: {
        userId: config.userId,
        interviewId: config.interviewId,
        jobRole: config.jobRole || 'Software Engineer',
        interviewType: config.interviewType || 'TECHNICAL',
        difficulty: config.difficulty || 'MEDIUM',
        maxQuestions: config.maxQuestions || 5,
      },
      questionsAsked: 1,
      previous_qa: [],
      evaluations: [],
      currentQuestion: firstQuestion,
      audioChunks: []
    });

    // Respond with success
    socket.emit('interview-initialized', {
      interviewId: config.interviewId,
      status: 'ready',
      question: firstQuestion.question
    });
    console.log('Sent interview-initialized');

    // Send first question
    setTimeout(() => {
      socket.emit('next-question', {
        question: firstQuestion.question,
        audio: "", // Fall back to client TTS
        isFollowUp: false,
        reaction: "",
        expectedDuration: 60,
        currentProgress: {
          questionsAsked: 1,
          maxQuestions: config.maxQuestions || 5
        }
      });
      console.log('Sent first question');
    }, 1000);
  });

  // Handle Recording Start
  socket.on('start-recording', (data) => {
    console.log('Start recording for:', data.interviewId);
    const state = voiceInterviews.get(socket.id);
    if (state) {
      state.audioChunks = [];
    }
  });

  // Handle Audio Chunk
  socket.on('audio-chunk', (data) => {
    const state = voiceInterviews.get(socket.id);
    if (state && data.chunk) {
      state.audioChunks.push(Buffer.from(data.chunk, 'base64'));
    }
  });

  // Handle Recording Stop
  socket.on('stop-recording', async (data) => {
    console.log('Stop recording for:', data.interviewId);
    
    const state = voiceInterviews.get(socket.id);
    if (!state) {
      console.error('No state found for socket:', socket.id);
      return;
    }

    try {
      // 1. Transcribe audio chunks or fallback to client transcript
      let userAnswer = data.transcript || '';
      
      if (!userAnswer && state.audioChunks.length > 0) {
        console.log('Transcribing accumulated audio chunks...');
        const audioBuffer = Buffer.concat(state.audioChunks);
        if (audioBuffer.length > 0) {
          try {
            userAnswer = await transcribeAudioInternal(audioBuffer, 'audio/webm');
          } catch (trError) {
            console.error('Transcription error:', trError);
          }
        }
      }

      if (!userAnswer || userAnswer.trim() === '') {
        userAnswer = "No response was recorded.";
      }

      // Emit transcription complete
      socket.emit('transcription-complete', {
        transcription: userAnswer
      });

      // Emit evaluating state
      socket.emit('evaluating', {
        status: 'evaluating'
      });

      // 2. Evaluate answer
      console.log('Evaluating answer dynamically...');
      const evaluation = await evaluateAnswerInternal(
        state.currentQuestion.question,
        userAnswer,
        state.currentQuestion.ideal_answer,
        state.currentQuestion.keywords,
        state.config.jobRole
      );

      state.evaluations.push(evaluation);
      state.previous_qa.push({
        question: state.currentQuestion.question,
        answer: userAnswer
      });

      // Emit evaluation results
      socket.emit('evaluation', {
        score: evaluation.final_score || evaluation.score || 0,
        feedback: evaluation.feedback || '',
        keyPointsCovered: evaluation.strengths || [],
        missedPoints: evaluation.improvements || [],
        fillerWordsCount: 0
      });

      // 3. Generate next question or complete interview
      if (state.questionsAsked >= state.config.maxQuestions) {
        // Complete interview
        const report = generateFinalReport(state.previous_qa, state.evaluations);
        socket.emit('interview-completed', {
          interviewId: state.config.interviewId,
          report
        });
        console.log('Sent interview-completed');
      } else {
        // Determine difficulty dynamically
        let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
        const progressPercent = (state.questionsAsked / state.config.maxQuestions) * 100;
        if (progressPercent < 30) {
          difficulty = 'easy';
        } else if (progressPercent < 70) {
          difficulty = 'medium';
        } else {
          difficulty = 'hard';
        }

        console.log(`Generating question ${state.questionsAsked + 1}/${state.config.maxQuestions}...`);
        const nextQuestionData = await generateQuestionInternal(
          state.config.jobRole,
          difficulty,
          state.previous_qa,
          true
        );

        state.currentQuestion = nextQuestionData;
        state.questionsAsked += 1;

        // Send next question after a brief delay for user to read feedback
        setTimeout(() => {
          socket.emit('next-question', {
            question: nextQuestionData.question,
            audio: "",
            isFollowUp: nextQuestionData.is_follow_up || false,
            reaction: nextQuestionData.reaction || "",
            expectedDuration: 60,
            currentProgress: {
              questionsAsked: state.questionsAsked,
              maxQuestions: state.config.maxQuestions
            }
          });
          console.log('Sent next question:', nextQuestionData.question);
        }, 3000);
      }
    } catch (error) {
      console.error('Error in Socket.io stop-recording handler:', error);
      socket.emit('interview-error', {
        error: 'An error occurred while evaluating your response. Please try again.'
      });
    }
  });

  // Handle End Interview Event
  socket.on('end-interview', (data) => {
    console.log('End interview for:', data.interviewId);
    const state = voiceInterviews.get(socket.id);
    if (state) {
      const report = generateFinalReport(state.previous_qa, state.evaluations);
      socket.emit('interview-completed', {
        interviewId: state.config.interviewId,
        report
      });
      console.log('Sent interview-completed on end-interview');
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected from /voice-interview namespace:', socket.id);
    voiceInterviews.delete(socket.id);
  });
});

// Serve static frontend assets in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../dist');
  app.use(express.static(distPath));
  
  app.get('*', (req, res) => {
    // Only intercept GET requests that aren't API endpoints
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.resolve(distPath, 'index.html'));
    }
  });
}

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
