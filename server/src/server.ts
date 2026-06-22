import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import FormData from 'form-data';
import fetch from 'node-fetch';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { openai } from './utils/ai';
import { parseResume, parseJD, ParsedResume, ParsedJD } from './services/resumeParser';
import { generatePersonalisedQuestions } from './services/questionGenerator';
import { DifficultyState, shouldEscalate, shouldDeescalate, getNextDifficulty, generateAdaptiveFollowUp } from './services/adaptiveDifficulty';

dotenv.config();

let supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder-url.supabase.co';
if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
  supabaseUrl = 'https://placeholder-url.supabase.co';
}
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

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

  const isNoAnswer = !answer || 
                     answer.trim() === '' || 
                     /no response was recorded|no answer provided|skipped|skip/i.test(answer);

  if (isNoAnswer) {
    return { reaction: "Let's move to the next question.", crossQuestion: null };
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

  // Only ask a follow-up question if they responded properly and the response is complete
  const isProperAndComplete = answer.length >= 100 && 
                              highestPattern !== 'introduction' && 
                              highestPattern !== 'no_projects' &&
                              !/\b(don't know|do not know|not sure|no idea|skip|pass|cannot answer)\b/i.test(answer);

  if (isProperAndComplete) {
    // Generate cross-questions based on detected patterns
    if (highestPattern === 'metrics') {
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
  } else {
    crossQuestion = null;
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

1. DETECT EMPTY / MISSING ANSWERS:
   - Check if the last answer was empty, blank, or equals "No response was recorded." or "No answer provided.".
   - If the answer was empty/missing, the "reaction" field MUST be exactly "Let's move to the next question." or "Let's continue.". You must NOT evaluate, critique, or compliment it.

2. EVALUATE THE ANSWER QUALITY (only if NOT empty/missing):
   - Identify if the answer was strong, detailed, brief, vague, incorrect, or a simple greeting/introduction/name introduction.
   - If they just stated their name or introduced themselves (e.g. "My name is Sandeep"), greet them warmly and naturally (e.g., "Nice to meet you, Sandeep! Let's dive in..."). Do NOT say "Interesting approach" or "Nice approach" to an introduction.
   - If their answer was strong, compliment them specifically on their approach, reasoning, or metrics (e.g., "That's a very solid way to optimize that database query. I like how you analyzed the index trade-offs.").
   - If their answer was weak, brief, or missed key details, politely critique it or highlight the gaps (e.g., "Thanks for that brief overview. You mentioned using a cache, but didn't touch on cache invalidation...").

3. DECIDE ON A FOLLOW-UP OR NEW QUESTION:
   - Ask a specific follow-up question (cross-question) digging deeper ONLY if the candidate's last answer was proper, detailed, and complete. For example, if they detailed a specific project, approach, or technical decision, follow up on the trade-offs, technologies, or edge cases of that specific response.
   - If the candidate's last answer was NOT proper, was too brief, vague, or incomplete (e.g., they gave a very short response, said "I don't know" or "skip", or just introduced themselves), do NOT ask a follow-up question. Instead, transition smoothly to a standard new question corresponding to the ${difficulty} difficulty and ${role} role.
   - CRITICAL: Do NOT generate or repeat any question that has already been asked in the previous interview context history (the history of Q1, Q2, etc.). Always generate a completely new question on a different topic.

4. WRITE A CONVERSATIONAL "reaction" AND "question" SEPARATELY:
   - The "reaction" string must contain ONLY your natural verbal response or feedback to their last answer (e.g., your greeting, compliment, or constructive critique), transitioning smoothly to the next question.
   - The "reaction" must NEVER contain any question, question mark, or follow-up question prompt.
   - The actual follow-up or new question must be placed ENTIRELY inside the "question" field.
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
    throw new Error('No valid Groq API key configured for Whisper transcription.');
  }

  console.log(`📡 Calling Groq Whisper API for transcription internally (buffer size: ${audioBuffer.length} bytes)...`);
  
  const formData = new globalThis.FormData();
  const blob = new globalThis.Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  formData.append('file', blob, 'audio.webm');
  formData.append('model', 'whisper-large-v3');
  formData.append('language', 'en');
  formData.append('response_format', 'json');

  const groqResponse = await globalThis.fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: formData,
  });

  if (!groqResponse.ok) {
    const errorText = await groqResponse.text();
    console.error('❌ Groq transcribe API error internally:', groqResponse.status, errorText);
    throw new Error(`Groq transcription failed with status ${groqResponse.status}`);
  }

  const groqData: any = await groqResponse.json();
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

// Generate Personalised Questions API (REST Endpoint)
app.post('/api/interview/generate-personalised-questions', async (req, res) => {
  try {
    const { config, resumeText, jdText } = req.body;
    let parsedResume = null;
    let parsedJD = null;

    if (resumeText) {
      parsedResume = await parseResume(resumeText);
    }
    if (jdText) {
      parsedJD = await parseJD(jdText);
    }

    const questions = await generatePersonalisedQuestions(config, parsedResume, parsedJD);
    res.json({
      questions,
      parsedResume: parsedResume ? { name: parsedResume.name } : null,
      parsedJD: parsedJD ? { roleName: parsedJD.roleName, companyName: parsedJD.companyName } : null
    });
  } catch (error) {
    console.error('❌ REST generate-personalised-questions error:', error);
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
  
  // If the user indicates they don't know, want to skip, or cannot answer, always treat as an answer (skip/advance)
  const skipOrDontKnowPatterns = /\b(don't know|dont know|do not know|no idea|skip|pass|cannot answer|can't answer|don't understand and want to skip|move on|next question)\b/i;
  if (skipOrDontKnowPatterns.test(input)) {
    return {
      type: 'answer',
      reply: null
    };
  }

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
1. "answer": The candidate is attempting to answer the question, even if it is a short, partial, or incorrect answer, or if they state that they do not know the answer, want to skip/pass the question, or cannot answer it (e.g., "I don't know", "skip please", "I have no idea", "I cannot answer this"). These must be classified as "answer" so the interview can advance.
2. "repeat": The candidate is asking to repeat the question or didn't hear/understand it (e.g., "can you repeat?", "what was the question?", "pardon?", "say again").
3. "clarification": The candidate is asking for clarification about a term in the question, or making a polite/social/unrelated comment (e.g., "thank you", "hello", "interesting", "what do you mean by X?"). If they say "that's a tough one" or "difficult" but follow up with "I don't know" or a similar refusal to answer, classify it as "answer".

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

    const speakerId = mapVoiceSpeaker(speaker ? String(speaker) : undefined);

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
        speaker: speakerId,
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
interface SocketSession {
  sessionId: string;
  userId: string;
  config: {
    domain: string;
    difficulty: string;
    interviewType: string;
    durationMinutes: number;
    maxQuestions: number;
    voice?: string;
  };
  conversationHistory: Array<{ role: 'interviewer' | 'candidate'; content: string }>;
  audioBuffer: Buffer[];
  questionCount: number;
  answers: Array<{ questionIndex: number; questionText: string; transcript: string; score?: any }>;
  isProcessing: boolean;
  parsedResume?: ParsedResume | null;
  parsedJD?: ParsedJD | null;
  difficultyState?: DifficultyState;
  nextAdaptiveQuestion?: string | null;
  questionBank?: string[];
  nonVerbalSummary?: any;
}

const socketSessions = new Map<string, SocketSession>();

// Groq fallback stream function
async function* streamGroqLlama(messages: any[]) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 120,
      temperature: 0.75,
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Groq Llama Stream error:', response.status, errorText);
    throw new Error(`Groq stream failed with status ${response.status}`);
  }

  const body = response.body;
  if (!body) return;

  for await (const chunk of body) {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      const cleaned = line.trim();
      if (!cleaned || cleaned === 'data: [DONE]') continue;
      if (cleaned.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(cleaned.slice(6));
          const token = parsed.choices?.[0]?.delta?.content || '';
          if (token) {
            yield token;
          }
        } catch (e) {
          // boundaries might slice JSON
        }
      }
    }
  }
}

// Intent classifier
async function classifyIntent(transcript: string, history: any[]): Promise<'answer' | 'repeat' | 'clarify'> {
  const text = transcript.trim().toLowerCase();
  if (/repeat|say that again|didn't hear|could you repeat/i.test(text)) {
    return 'repeat';
  }
  if (/clarify|what do you mean|explain the question/i.test(text)) {
    return 'clarify';
  }
  return 'answer';
}

// System prompt builder with full candidate context and target role JD
function buildSystemPrompt(session: SocketSession): string {
  const { config, parsedResume, parsedJD, questionCount } = session;

  const candidateCtx = parsedResume ? `
You are interviewing ${parsedResume.name ?? 'the candidate'}.
Their background: ${parsedResume.currentRole || 'Not specified'}, ${parsedResume.yearsExperience || 'unknown'} years experience.
Their key skills: ${parsedResume.skills.slice(0, 8).join(', ')}.
Their notable projects: ${parsedResume.topProjects.slice(0, 2).map(p => p.name).join(', ')}.
Reference these naturally in follow-ups — e.g. "Given your experience with ${parsedResume.topProjects[0]?.name || 'your projects'}, how would you..."
` : '';

  const roleCtx = parsedJD ? `
Target role: ${parsedJD.roleName || 'Target Role'} at ${parsedJD.companyName || 'Target Company'}.
Required skills to probe: ${parsedJD.requiredSkills.slice(0, 6).join(', ')}.
If candidate hasn't demonstrated a required skill yet, probe it.
` : '';

  const bankCtx = session.questionBank && session.questionBank.length > 0 ? `
Pre-generated personalized question bank for this session:
${session.questionBank.map((q, i) => `${i + 1}. ${q}`).join('\n')}
If you choose to "move on" to a new question, please ask the next question from the bank instead of inventing one.
` : '';

  const currentDiff = session.difficultyState?.current || config.difficulty;

  return `You are Arjun, a senior engineering interviewer.
${candidateCtx}
${roleCtx}
${bankCtx}
Difficulty: ${currentDiff}. Domain: ${config.domain}.
Interview type: ${config.interviewType}.
Questions asked so far: ${questionCount} of ${config.maxQuestions}.

Rules:
- Speak naturally.
- Crucial: Before asking the next question, start your response with a clear evaluation or compliment/critique of their previous answer (e.g. tell them if it was a great response, if you liked a specific point, or if it lacked details/correctness).
- After providing the brief feedback, transition to and ask the next question accordingly.
- Keep replies concise (around 2-3 sentences).
- Reference the candidate's actual experience when relevant.
- When all ${config.maxQuestions} questions are done say exactly: "That wraps up our session today."
`;
}

// Helper to map custom frontend voices to recognized Sarvam AI speaker IDs
function mapVoiceSpeaker(voiceName: string | undefined): string {
  const speakerId = String(voiceName || 'kavya').toLowerCase().trim();
  if (speakerId === 'meera') return 'kavya';
  if (speakerId === 'arjun') return 'amit';
  if (speakerId === 'ananya') return 'priya';
  return speakerId;
}

// Sarvam AI speech stream
async function streamTTSAndEmit(socket: any, text: string, voiceName: string) {
  const SARVAM_API_KEY = process.env.SARVAM_API_KEY || '';
  if (!SARVAM_API_KEY || SARVAM_API_KEY === 'your-sarvam-api-key-here') {
    console.warn('⚠️ Sarvam key missing - client will speak using local TTS fallback');
    socket.emit('tts:audio', { audioBase64: '', sampleRate: 22050, textFallback: text });
    return;
  }

  const speakerId = mapVoiceSpeaker(voiceName);

  try {
    const response = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: 'en-IN',
        speaker: speakerId,
        pace: 1.05,
        speech_sample_rate: 22050,
        model: 'bulbul:v3'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Sarvam AI API error body:', errorText);
      throw new Error(`Sarvam API failed with status ${response.status}`);
    }

    const data = await response.json();
    if (data.audios && data.audios.length > 0) {
      socket.emit('tts:audio', { audioBase64: data.audios[0], sampleRate: 22050 });
    }
  } catch (err) {
    console.error('Sarvam TTS error:', err);
    socket.emit('tts:audio', { audioBase64: '', sampleRate: 22050, textFallback: text });
  }
}

// Fetch OpenAI evaluations helper
async function fetchOpenAIScore(question: string, transcript: string, domain: string, difficulty: string) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key-here') {
    return {
      score: 8,
      depth: 7,
      clarity: 8,
      relevance: 9,
      technicalScore: 8,
      fillerWords: [],
      strength: "Good basic response structure.",
      gap: "Could include more specific metrics."
    };
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: `Score this interview answer. Return ONLY valid JSON.
Question: "${question}"
Answer: "${transcript}"
Domain: ${domain}, Difficulty: ${difficulty}
{"score":0-10,"depth":0-10,"clarity":0-10,"relevance":0-10,"technicalScore":0-10,"fillerWords":[],"strength":"one sentence","gap":"one sentence"}`
      }],
      max_tokens: 200,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI scoring failed with status ${response.status}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

// Non-blocking save answer to database
async function saveAnswerToSupabase(sessionId: string, questionIndex: number, questionText: string, transcript: string) {
  try {
    await supabaseAdmin
      .from('answers')
      .insert({
        session_id: sessionId,
        question_index: questionIndex,
        question_text: questionText,
        answer_transcript: transcript,
        score_data: null
      });
  } catch (err) {
    console.error('Failed to save answer to Supabase:', err);
  }
}

// Async score execution
async function scoreAnswerAsync(socket: any, session: SocketSession, transcript: string, question: string) {
  try {
    const currentDiff = session.difficultyState?.current || session.config.difficulty;
    const scoreData = await fetchOpenAIScore(question, transcript, session.config.domain, currentDiff);
    
    const lastAnswer = session.answers[session.answers.length - 1];
    if (lastAnswer) {
      lastAnswer.score = scoreData;
    }

    socket.emit('score:update', scoreData);

    // Save evaluation scores back to Supabase
    await supabaseAdmin
      .from('answers')
      .update({ score_data: scoreData })
      .eq('session_id', session.sessionId)
      .eq('question_index', session.questionCount);

    // Adaptive difficulty logic check
    const score = scoreData.score ?? 5;

    if (session.difficultyState) {
      // Update consecutive counters
      if (score >= 8) {
        session.difficultyState.consecutiveHighScores++;
        session.difficultyState.consecutiveLowScores = 0;
      } else if (score <= 3) {
        session.difficultyState.consecutiveLowScores++;
        session.difficultyState.consecutiveHighScores = 0;
      } else {
        session.difficultyState.consecutiveHighScores = 0;
        session.difficultyState.consecutiveLowScores = 0;
      }

      // Check if we should adapt
      if (shouldEscalate(session.difficultyState, score)) {
        const newDiff = getNextDifficulty(session.difficultyState.current, 'up');
        if (newDiff !== session.difficultyState.current) {
          const oldDiff = session.difficultyState.current;
          session.difficultyState.current = newDiff;
          session.difficultyState.consecutiveHighScores = 0;
          session.difficultyState.escalationHistory.push(`Q${session.questionCount}: escalated to ${newDiff}`);
          socket.emit('difficulty:changed', { from: oldDiff, to: newDiff, direction: 'up' });
          
          // Pre-generate adaptive follow-up
          const systemPrompt = buildSystemPrompt(session);
          const adaptiveQ = await generateAdaptiveFollowUp(session, newDiff, 'escalate', systemPrompt);
          session.nextAdaptiveQuestion = adaptiveQ;
        }
      } else if (shouldDeescalate(session.difficultyState, score)) {
        const newDiff = getNextDifficulty(session.difficultyState.current, 'down');
        if (newDiff !== session.difficultyState.current) {
          const oldDiff = session.difficultyState.current;
          session.difficultyState.current = newDiff;
          session.difficultyState.consecutiveLowScores = 0;
          session.difficultyState.escalationHistory.push(`Q${session.questionCount}: de-escalated to ${newDiff}`);
          socket.emit('difficulty:changed', { from: oldDiff, to: newDiff, direction: 'down' });
          
          // Pre-generate adaptive follow-up
          const systemPrompt = buildSystemPrompt(session);
          const adaptiveQ = await generateAdaptiveFollowUp(session, newDiff, 'deescalate', systemPrompt);
          session.nextAdaptiveQuestion = adaptiveQ;
        }
      }
    }
      
  } catch (e) {
    console.error('Async scoring failed:', e);
  }
}

interface SkillGapReport {
  demonstrated: string[];
  gaps: string[];
  partiallyDemonstrated: string[];
  recommendations: { skill: string; resource: string; priority: 'high' | 'medium' | 'low' }[];
  overallReadiness: number;
  verdict: string;
}

// Generate skill gap report on JD and interview answers
async function generateSkillGapReport(session: SocketSession): Promise<SkillGapReport | null> {
  if (!session.parsedJD) return null;

  const answeredTopics = session.answers.map(a => `Q: ${a.questionText}\nA: ${a.transcript}`).join('\n');
  const requiredSkills = session.parsedJD.requiredSkills;

  console.log('📡 Generating skill gap report via OpenAI...');
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: `Based on this interview, identify skill gaps vs the job requirements.
      
Required skills for the role: ${requiredSkills.join(', ')}
Candidate's interview answers: ${answeredTopics.slice(0, 3000)}

Return ONLY valid JSON:
{
  "demonstrated": ["skill1", "skill2"],
  "gaps": ["skill3", "skill4"],
  "partiallyDemonstrated": ["skill5"],
  "recommendations": [
    { "skill": "skill3", "resource": "specific course or topic to study", "priority": "high" }
  ],
  "overallReadiness": 85,
  "verdict": "one sentence hiring recommendation"
}`
    }],
    max_tokens: 600,
    temperature: 0,
    response_format: { type: 'json_object' }
  });

  try {
    return JSON.parse(res.choices[0].message.content || 'null');
  } catch (err) {
    console.error('Failed to parse skill gap report:', err);
    return null;
  }
}

// Generate non-verbal body language tips based on tracking metrics
async function generateNonVerbalTips(summary: any): Promise<string[]> {
  if (!summary) return [];
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key-here') {
    return [
      "Maintain consistent eye contact with the camera when presenting core concepts.",
      "Vary expressions during transitions to appear more engaged and confident.",
      "Keep your head centered and chin level to project maximum executive presence."
    ];
  }

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: `Give 3 specific, actionable body language improvement tips based on these interview metrics.
Eye contact: ${summary.eyeContactPercent}%
Dominant expression: ${summary.dominantExpression}
Confidence score: ${summary.confidenceScore}
Blink rate: ${summary.blinkRate}/min

Return ONLY a JSON object with a single "tips" key containing an array of 3 strings:
{
  "tips": [
    "tip description (max 20 words)",
    "tip description (max 20 words)",
    "tip description (max 20 words)"
  ]
}`
      }],
      max_tokens: 200,
      temperature: 0.6,
      response_format: { type: 'json_object' }
    });

    const parsed = JSON.parse(res.choices[0].message.content || '{"tips":[]}');
    return parsed.tips || [];
  } catch (err) {
    console.error('Failed to generate non-verbal tips:', err);
    return [
      "Maintain consistent eye contact with the camera when presenting core concepts.",
      "Vary expressions during transitions to appear more engaged and confident.",
      "Keep your head centered and chin level to project maximum executive presence."
    ];
  }
}

// Complete early or scheduled interview
async function endSession(socket: any, session: SocketSession) {
  console.log(`Ending session ${session.sessionId}...`);

  const scores = session.answers
    .map(a => a.score?.score ?? 0)
    .filter(s => s > 0);
  const averageScoreVal = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) * 10 : 70;

  const radarScores = {
    technicalAccuracy: Math.round(session.answers.reduce((sum, a) => sum + (a.score?.technicalScore ?? 8), 0) / Math.max(1, session.answers.length) * 10),
    communication: Math.round(session.answers.reduce((sum, a) => sum + (a.score?.clarity ?? 8), 0) / Math.max(1, session.answers.length) * 10),
    problemSolving: Math.round(session.answers.reduce((sum, a) => sum + (a.score?.depth ?? 8), 0) / Math.max(1, session.answers.length) * 10),
    confidence: Math.round(session.answers.reduce((sum, a) => sum + (a.score?.relevance ?? 8), 0) / Math.max(1, session.answers.length) * 10),
    relevance: Math.round(session.answers.reduce((sum, a) => sum + (a.score?.relevance ?? 8), 0) / Math.max(1, session.answers.length) * 10),
    structure: Math.round(session.answers.reduce((sum, a) => sum + (a.score?.clarity ?? 8), 0) / Math.max(1, session.answers.length) * 10)
  };

  const communicationStats = {
    wpm: 135,
    fillerWordCount: session.answers.reduce((sum, a) => sum + (a.score?.fillerWords?.length || 0), 0),
    fluencyScore: radarScores.communication
  };

  let skillGapReport: SkillGapReport | null = null;
  if (session.parsedJD) {
    skillGapReport = await generateSkillGapReport(session);
  }

  let nonVerbalTips: string[] = [];
  if (session.nonVerbalSummary) {
    nonVerbalTips = await generateNonVerbalTips(session.nonVerbalSummary);
    session.nonVerbalSummary.tips = nonVerbalTips;
  }

  try {
    await supabaseAdmin
      .from('sessions')
      .update({
        overall_score: averageScoreVal,
        radar_scores: radarScores,
        communication_stats: communicationStats,
        difficulty_journey: session.difficultyState?.escalationHistory || [],
        skill_gap_report: skillGapReport,
        non_verbal_summary: session.nonVerbalSummary || null
      })
      .eq('id', session.sessionId);
  } catch (err) {
    console.error('Error saving final session report to Supabase:', err);
  }

  const report = {
    overallScore: Math.round(averageScoreVal),
    radarScores,
    communicationStats,
    difficultyJourney: session.difficultyState?.escalationHistory || [],
    skillGapReport,
    nonVerbalSummary: session.nonVerbalSummary || null
  };

  socket.emit('session:end', {
    sessionId: session.sessionId,
    finalReport: report
  });
}

// Client response handler loop
async function handleCandidateResponse(socket: any, session: SocketSession, transcript: string) {
  const intent = await classifyIntent(transcript, session.conversationHistory);

  if (intent === 'repeat') {
    const lastQ = session.conversationHistory.filter(m => m.role === 'interviewer').slice(-1)[0];
    const textToRepeat = lastQ ? lastQ.content : "Tell me about yourself and your background.";
    await streamTTSAndEmit(socket, textToRepeat, session.config.voice || 'meera');
    socket.emit('tts:done-all');
    session.isProcessing = false;
    return;
  }

  // Save candidate messages
  session.conversationHistory.push({ role: 'candidate', content: transcript });
  try {
    await supabaseAdmin.from('messages').insert({
      session_id: session.sessionId,
      role: 'candidate',
      content: transcript
    });
  } catch (err) {
    console.warn('Failed to insert candidate message to Supabase messages:', err);
  }

  const lastQ = session.conversationHistory.filter(m => m.role === 'interviewer').slice(-1)[0];
  const questionText = lastQ ? lastQ.content : "Tell me about yourself and your background.";

  session.answers.push({ questionIndex: session.questionCount, questionText, transcript });

  saveAnswerToSupabase(session.sessionId, session.questionCount, questionText, transcript);

  let fullReply = '';
  let firstSentence = '';
  let ttsStarted = false;

  try {
    if (session.nextAdaptiveQuestion) {
      console.log('🔄 Injecting pre-generated adaptive question:', session.nextAdaptiveQuestion);
      fullReply = session.nextAdaptiveQuestion;
      session.nextAdaptiveQuestion = null; // Consume

      // Simulate streaming tokens to the client
      const words = fullReply.split(' ');
      for (const word of words) {
        socket.emit('interviewer:token', { token: word + ' ' });
        await new Promise(r => setTimeout(r, 40));
      }

      firstSentence = fullReply.split(/[.?!]/)[0] + '.';
      ttsStarted = true;
      await streamTTSAndEmit(socket, firstSentence, session.config.voice || 'meera');
    } else {
      const systemPrompt = buildSystemPrompt(session);
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...session.conversationHistory.map(h => ({
          role: h.role === 'interviewer' ? 'assistant' : 'user',
          content: h.content
        }))
      ];

      const replyStream = streamGroqLlama(apiMessages);

      for await (const token of replyStream) {
        fullReply += token;
        socket.emit('interviewer:token', { token });

        if (!ttsStarted && /[.?!]/.test(fullReply)) {
          const match = fullReply.match(/^[^.?!]+[.?!]/);
          if (match) {
            firstSentence = match[0];
            ttsStarted = true;
            streamTTSAndEmit(socket, firstSentence, session.config.voice || 'meera');
          }
        }
      }
    }
  } catch (streamErr) {
    console.error('Streaming error from Groq:', streamErr);
    fullReply = "I understand. Let's move on to the next question.";
    socket.emit('interviewer:token', { token: fullReply });
  }

  socket.emit('interviewer:done', { fullText: fullReply });

  // Stream remainder audio
  const remainder = fullReply.slice(firstSentence.length).trim();
  if (remainder.length > 5) {
    await streamTTSAndEmit(socket, remainder, session.config.voice || 'meera');
  }
  socket.emit('tts:done-all');

  // Trigger evaluation
  scoreAnswerAsync(socket, session, transcript, questionText);

  // Save interviewer final response
  try {
    await supabaseAdmin.from('messages').insert({
      session_id: session.sessionId,
      role: 'interviewer',
      content: fullReply
    });
  } catch (err) {
    console.warn('Failed to save interviewer response in messages:', err);
  }

  const isConclusionMessage = fullReply.toLowerCase().includes('wraps up our session') || 
                              fullReply.toLowerCase().includes('conclusion of our interview');

  if (isConclusionMessage || session.questionCount >= session.config.maxQuestions) {
    console.log('Session end condition met. Informing client to submit final metrics...');
    socket.emit('session:pre-end', { sessionId: session.sessionId });
    return;
  }

  if (fullReply.includes('?')) {
    session.questionCount++;
  }
  session.conversationHistory.push({ role: 'interviewer', content: fullReply });
  session.isProcessing = false;
}

const voiceInterviewNamespace = io.of('/voice-interview');

voiceInterviewNamespace.on('connection', (socket) => {
  console.log('Client connected to /voice-interview namespace:', socket.id);

  socket.on('session:start', async (payload: { sessionConfig: any; authToken: string }) => {
    const { sessionConfig, authToken } = payload;
    console.log('Received session:start event for namespace...');

    try {
      // Validate Auth Token
      let user: any = null;
      try {
        const { data, error: authError } = await supabaseAdmin.auth.getUser(authToken);
        if (!authError && data?.user) {
          user = data.user;
        }
      } catch (authFetchErr: any) {
        console.warn('Supabase auth fetch failed (falling back to stateless JWT decode):', authFetchErr.message);
      }

      if (!user) {
        try {
          const parts = authToken.split('.');
          if (parts.length >= 2) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            user = {
              id: payload.sub || payload.id,
              email: payload.email,
              user_metadata: payload.user_metadata || {}
            };
            console.log('Stateless JWT decode succeeded for user:', user.id);
          }
        } catch (jwtErr) {
          console.error('Stateless JWT decode failed:', jwtErr);
        }
      }

      if (!user) {
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Invalid or expired authentication token.' });
        return;
      }

      // Ensure profile exists in public.profiles to satisfy foreign key constraints
      try {
        const { error: profileErr } = await supabaseAdmin
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
            avatar_url: user.user_metadata?.avatar_url || ''
          });
        if (profileErr) {
          console.error('Failed to upsert profile in server database:', profileErr.message, profileErr.details);
        } else {
          console.log('Profile ensured in database for user:', user.id);
        }
      } catch (dbErr) {
        console.warn('Non-blocking user profile upsert warning:', dbErr);
      }

      // Initialize Supabase session record
      let sessionId = '';
      try {
        const { data: sessionData, error: sessionError } = await supabaseAdmin
          .from('sessions')
          .insert({
            user_id: user.id,
            domain: sessionConfig.domain || 'General',
            difficulty: sessionConfig.difficulty || 'Medium',
            interview_type: sessionConfig.interviewType || 'TECHNICAL',
            duration_minutes: sessionConfig.durationMinutes || 15,
            overall_score: null,
            radar_scores: null,
            communication_stats: null
          })
          .select()
          .single();

        if (sessionError || !sessionData) {
          throw new Error(sessionError?.message || 'Database insert failed');
        }
        sessionId = sessionData.id;
      } catch (dbInsertErr: any) {
        console.warn('Database session insert failed (falling back to local mock session ID):', dbInsertErr.message);
        sessionId = `mock-session-${Math.random().toString(36).substr(2, 9)}`;
      }

      const voicePref = sessionConfig.voice || 'meera';

      // Parse Resume and JD if provided (otherwise fetch stored resume if requested)
      let parsedResume: ParsedResume | null = null;
      let parsedJD: ParsedJD | null = null;
      let questionBank: string[] = [];

      if (sessionConfig.resumeText) {
        parsedResume = await parseResume(sessionConfig.resumeText);
        // Save to profiles
        try {
          await supabaseAdmin
            .from('profiles')
            .update({ parsed_resume: parsedResume, last_resume_uploaded_at: new Date() })
            .eq('id', user.id);
        } catch (dbErr) {
          console.warn('Failed to update user profile with parsed resume:', dbErr);
        }
      } else if (sessionConfig.useStoredResume) {
        try {
          const { data } = await supabaseAdmin
            .from('profiles')
            .select('parsed_resume')
            .eq('id', user.id)
            .single();
          if (data?.parsed_resume) {
            parsedResume = data.parsed_resume;
          }
        } catch (dbErr) {
          console.warn('Failed to fetch user stored resume:', dbErr);
        }
      }

      if (sessionConfig.jdText) {
        parsedJD = await parseJD(sessionConfig.jdText);
      }

      let firstQuestionText = `Hello! Welcome to your ${sessionConfig.difficulty} ${sessionConfig.domain} interview. Let's start with a brief introduction. Tell me about yourself and your background.`;

      // Generate Personalized Question Bank
      if (parsedResume || parsedJD) {
        const questionsConfig = {
          domain: sessionConfig.domain || 'General',
          difficulty: sessionConfig.difficulty || 'Medium',
          interviewType: sessionConfig.interviewType || 'TECHNICAL',
          durationMinutes: sessionConfig.durationMinutes || 15,
          maxQuestions: sessionConfig.maxQuestions || 5,
        };
        questionBank = await generatePersonalisedQuestions(questionsConfig, parsedResume, parsedJD);
        if (questionBank.length > 0) {
          firstQuestionText = questionBank[0];
        }
      }
      
      // Set up SocketSession state
      const sessionState: SocketSession = {
        sessionId,
        userId: user.id,
        config: {
          domain: sessionConfig.domain || 'General',
          difficulty: sessionConfig.difficulty || 'Medium',
          interviewType: sessionConfig.interviewType || 'TECHNICAL',
          durationMinutes: sessionConfig.durationMinutes || 15,
          maxQuestions: sessionConfig.maxQuestions || 5,
          voice: voicePref
        },
        conversationHistory: [{ role: 'interviewer', content: firstQuestionText }],
        audioBuffer: [],
        questionCount: 1,
        answers: [],
        isProcessing: false,
        parsedResume,
        parsedJD,
        difficultyState: {
          current: (sessionConfig.difficulty || 'medium').toLowerCase() as any,
          consecutiveHighScores: 0,
          consecutiveLowScores: 0,
          escalationHistory: []
        },
        nextAdaptiveQuestion: null,
        questionBank
      };

      socketSessions.set(socket.id, sessionState);

      // Save first question in messages database (non-blocking)
      try {
        await supabaseAdmin.from('messages').insert({
          session_id: sessionId,
          role: 'interviewer',
          content: firstQuestionText
        });
      } catch (msgErr: any) {
        console.warn('Non-blocking first message database insert failed:', msgErr.message);
      }

      socket.emit('session:ready', { 
        sessionId, 
        firstQuestion: firstQuestionText,
        candidateName: parsedResume?.name || null,
        roleName: parsedJD?.roleName || null,
        companyName: parsedJD?.companyName || null,
        projectName: parsedResume?.topProjects?.[0]?.name || null
      });

      // Play introductory question audio
      await streamTTSAndEmit(socket, firstQuestionText, voicePref);
      socket.emit('tts:done-all');

    } catch (err: any) {
      console.error('Session start exception:', err);
      socket.emit('error', { code: 'SESSION_START_FAILED', message: err.message || 'Failed to start interview.' });
    }
  });

  socket.on('audio:chunk', (chunk: any) => {
    console.log('🎙️ Server received audio:chunk event. Type of chunk:', typeof chunk, 'Is Buffer:', Buffer.isBuffer(chunk), 'Length/Size:', chunk ? (chunk.length || chunk.byteLength || 'N/A') : 'null');
    const session = socketSessions.get(socket.id);
    if (!session) {
      socket.emit('error', { code: 'SESSION_NOT_FOUND', message: 'No active session.' });
      return;
    }
    
    // Ensure we convert chunk to Buffer if it is an ArrayBuffer or other binary type
    let bufferChunk: Buffer;
    if (Buffer.isBuffer(chunk)) {
      bufferChunk = chunk;
    } else if (chunk instanceof ArrayBuffer) {
      bufferChunk = Buffer.from(chunk);
    } else if (chunk && chunk.buffer instanceof ArrayBuffer) {
      bufferChunk = Buffer.from(chunk.buffer);
    } else {
      console.warn('⚠️ Unknown chunk format, attempting to convert via Buffer.from...');
      bufferChunk = Buffer.from(chunk);
    }
    
    session.audioBuffer.push(bufferChunk);
  });

  socket.on('audio:end', async (payload?: { textFallback?: string }) => {
    console.log('⏹️ Server received audio:end event. Payload:', payload);
    const session = socketSessions.get(socket.id);
    if (!session) {
      socket.emit('error', { code: 'SESSION_NOT_FOUND', message: 'No active session.' });
      return;
    }

    if (session.isProcessing) {
      console.log('⚠️ Already processing user response - debounced.');
      return;
    }
    
    session.isProcessing = true;
    const bufferList = [...session.audioBuffer];
    session.audioBuffer = [];

    console.log(`📊 Processing audio buffer. Number of chunks in bufferList: ${bufferList.length}`);
    if (bufferList.length > 0) {
      const totalBytes = bufferList.reduce((sum, buf) => sum + buf.length, 0);
      console.log(`📊 Total bytes in bufferList: ${totalBytes}`);
    }

    if (bufferList.length === 0) {
      console.warn('⚠️ No audio buffer accumulated.');
      
      // If we have a fallback transcript from client-side speech recognition, use it!
      if (payload?.textFallback && payload.textFallback.trim().length > 0) {
        console.log(`📋 Audio buffer was empty, but client-side speech recognition fallback is available: "${payload.textFallback}"`);
        const transcript = payload.textFallback;
        socket.emit('transcript:final', { text: transcript, isFinal: true });
        await handleCandidateResponse(socket, session, transcript);
        return;
      }

      // DEVELOPMENT FALLBACK: Use default mock transcript to let the user proceed and test the application
      console.log('📋 No audio buffer and no textFallback. Using mock development transcript fallback.');
      const transcript = 'I solved this using Node.js, Express, and PostgreSQL, focusing on database indexing and query optimization to reduce latency.';
      socket.emit('transcript:final', { text: transcript, isFinal: true });
      await handleCandidateResponse(socket, session, transcript);
      return;
    }

    try {
      const audioBuffer = Buffer.concat(bufferList);
      // Transcribe WebM format
      let transcript = '';
      try {
        transcript = await transcribeAudioInternal(audioBuffer, 'audio/webm');
        
        // If Whisper returned something completely empty or just silent placeholders but we have a client transcript, use the client transcript.
        const isWhisperEmptyOrPlaceholder = !transcript || 
          transcript.trim() === '' || 
          /^(thank you\.?|\[music\]|\[silence\]|\[blank\])$/i.test(transcript.trim());
          
        if (isWhisperEmptyOrPlaceholder && payload?.textFallback && payload.textFallback.trim().length > 0) {
          console.log(`📋 Whisper output was empty/placeholder ("${transcript}"). Using client-side speech recognition fallback instead: "${payload.textFallback}"`);
          transcript = payload.textFallback;
        }
      } catch (transcribeErr: any) {
        console.warn('Groq transcription API failed:', transcribeErr.message);
        if (payload?.textFallback && payload.textFallback.trim().length > 0) {
          console.log(`📋 Using client-side speech recognition fallback transcript: "${payload.textFallback}"`);
          transcript = payload.textFallback;
        } else {
          console.warn('⚠️ No client-side fallback transcript available, using hardcoded default');
          transcript = 'I solved this using Node.js, Express, and PostgreSQL, focusing on database indexing and query optimization to reduce latency.';
        }
      }
      console.log(`🗣️ Transcribed text: "${transcript}"`);

      socket.emit('transcript:final', { text: transcript, isFinal: true });

      // Run answer logic and LLM stream
      await handleCandidateResponse(socket, session, transcript);

    } catch (err: any) {
      console.error('Error processing audio endpoint:', err);
      socket.emit('error', { code: 'PROCESSING_FAILED', message: 'Failed to transcribe your response.' });
      session.isProcessing = false;
    }
  });

  socket.on('control:skip', async () => {
    const session = socketSessions.get(socket.id);
    if (!session) return;
    
    console.log('Skipping current question...');
    session.isProcessing = true;
    await handleCandidateResponse(socket, session, "Candidate skipped this question.");
  });

  socket.on('control:repeat', async () => {
    const session = socketSessions.get(socket.id);
    if (!session) return;

    console.log('Repeating last interviewer question...');
    const lastQ = session.conversationHistory.filter(m => m.role === 'interviewer').slice(-1)[0];
    const textToRepeat = lastQ ? lastQ.content : "Tell me about yourself and your background.";
    await streamTTSAndEmit(socket, textToRepeat, session.config.voice || 'meera');
    socket.emit('tts:done-all');
  });

  socket.on('control:end', async (payload?: { nonVerbalSummary?: any }) => {
    const session = socketSessions.get(socket.id);
    if (!session) return;

    if (payload?.nonVerbalSummary) {
      session.nonVerbalSummary = payload.nonVerbalSummary;
    }

    console.log('Ending interview session prematurely...');
    await endSession(socket, session);
  });

  socket.on('session:complete', async (payload: { nonVerbalSummary: any }) => {
    const session = socketSessions.get(socket.id);
    if (!session) return;

    session.nonVerbalSummary = payload.nonVerbalSummary;
    console.log('Completing interview session naturally...');
    await endSession(socket, session);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected from voice interview:', socket.id);
    socketSessions.delete(socket.id);
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
