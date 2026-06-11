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
  if (answer.length > 300) {
    reactions.push("I appreciate the thoughtful depth in that answer.");
  } else if (answer.length > 150) {
    reactions.push("That's a comprehensive response.");
  } else if (answer.length < 30) {
    reactions.push("Can you elaborate a bit more on that?");
  } else {
    reactions.push("Good, thanks for that context.");
  }

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

// Generate Question API (AI-powered question generation)
app.post('/api/interview/generate-question', async (req, res) => {
  try {
    const { role, difficulty, previous_qa, use_ai } = req.body;

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
      
      // Fallback if all questions have been asked (shouldn't happen in normal interview)
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

    console.log('🎯 Generating question:', { role, difficulty, previous_qa_count: previous_qa?.length || 0, use_ai });

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

    // If no API key or use_ai is false, return mock question
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key-here' || !use_ai) {
      console.warn('⚠️ No OpenAI API key or use_ai=false - returning mock question');
      return res.json(buildFallbackQuestion());
    }

    // Build AI prompt for context-aware question generation
    let contextPrompt = `You are an expert technical interviewer for a ${role} position. Generate a ${difficulty} difficulty interview question.`;

    if (previous_qa && previous_qa.length > 0) {
      contextPrompt += `\n\nPrevious interview context:\n`;
      previous_qa.slice(-3).forEach((qa: any, i: number) => {
        contextPrompt += `Q${i+1}: ${qa.question}\nA${i+1}: ${qa.answer.substring(0, 200)}...\n\n`;
      });
      contextPrompt += `\nBased on the candidate's previous answers, generate a relevant follow-up question that:
1. Builds on their responses
2. Tests deeper understanding
3. Is appropriate for ${difficulty} difficulty
4. Is specific to ${role} role
5. Is different from previously asked questions`;
    }

    contextPrompt += `\n\nRespond in JSON format:
{
  "question": "the interview question",
  "ideal_answer": "what a strong answer would include",
  "keywords": ["key", "concepts", "to", "look", "for"],
  "role": "${role}",
  "difficulty": "${difficulty}"
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
          { role: 'system', content: 'You are an expert technical interviewer. Always respond with valid JSON.' },
          { role: 'user', content: contextPrompt }
        ],
        temperature: 0.8,
        max_tokens: 500,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', openaiResponse.status, errorText);

      // Keep the interview flow running even if OpenAI is unavailable/unauthorized.
      return res.json(buildFallbackQuestion());
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices[0].message.content;

    // Parse JSON response
    const questionData = JSON.parse(content);
    console.log('✅ Question generated:', questionData.question);

    // Add smart reaction to AI-generated response
    const lastAnswer = String(qaHistory[qaHistory.length - 1]?.answer || '').trim();
    const lastQuestion = String(qaHistory[qaHistory.length - 1]?.question || '').trim();
    const { reaction, crossQuestion } = generateSmartReactionAndQuestion(lastAnswer, lastQuestion, difficulty, normalizedRole, qaHistory);
    
    res.json({
      ...questionData,
      reaction
    });

  } catch (error) {
    console.error('❌ Question generation error:', error);

    const fallbackHistory = (Array.isArray(req.body?.previous_qa) ? req.body.previous_qa : []) as Array<{ question?: string; answer?: string }>;
    const lastAnswer = String(fallbackHistory[fallbackHistory.length - 1]?.answer || '').trim();
    const lastQuestion = String(fallbackHistory[fallbackHistory.length - 1]?.question || '').trim();
    const roleText = String(req.body?.role || 'software engineer').replace('_', ' ');
    const diffText = String(req.body?.difficulty || 'medium');

    const { reaction, crossQuestion } = generateSmartReactionAndQuestion(lastAnswer, lastQuestion, diffText, roleText, fallbackHistory);

    res.json({
      question: crossQuestion || `Thanks. Based on your previous response, what would you improve if you had to implement that ${roleText} solution again?`,
      ideal_answer: 'A strong answer should cover lessons learned, trade-offs revisited, and a concrete improvement plan.',
      keywords: ['lessons learned', 'improvements', 'trade-offs', 'plan'],
      reaction,
      role: req.body?.role,
      difficulty: req.body?.difficulty || 'medium'
    });
  }
});

// Evaluate Answer API (AI-powered answer evaluation)
app.post('/api/interview/evaluate', async (req, res) => {
  try {
    const { question, user_answer, ideal_answer, keywords, role } = req.body;

    console.log('📊 Evaluating answer for role:', role);
    console.log('   Question:', question.substring(0, 60) + '...');
    console.log('   Answer length:', user_answer.length, 'chars');

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

    // If no API key, return mock evaluation
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key-here') {
      console.warn('⚠️ No OpenAI API key - returning smart evaluation');
      const evaluation = evaluateAnswerQuality(user_answer, keywords || [], role);
      console.log(`✅ Smart evaluation score: ${evaluation.final_score}% (Grade: ${evaluation.grade})`);
      return res.json({
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
    "technical_accuracy": <1-10>,
    "depth_of_knowledge": <1-10>,
    "clarity_score": <1-10>,
    "completeness": <1-10>,
    "example_quality": <1-10>
  },
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "feedback": "detailed constructive feedback",
  "keyword_coverage": <count of keywords covered>
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
      });
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices[0].message.content;

    // Parse JSON response
    const evaluation = JSON.parse(content);
    console.log('✅ Evaluation complete - Score:', evaluation.final_score, 'Grade:', evaluation.grade);

    res.json(evaluation);

  } catch (error) {
    console.error('❌ Evaluation error:', error);
    const evaluation = evaluateAnswerQuality(
      (req.body?.user_answer || '').toString(),
      (req.body?.keywords || []) as string[],
      (req.body?.role || 'software_engineer').toString()
    );
    res.json({
      final_score: evaluation.final_score,
      grade: evaluation.grade,
      score_breakdown: {
        technical_accuracy: Math.round(evaluation.keyword_coverage / Math.max((req.body?.keywords?.length || 1), 1) * 10),
        depth_of_knowledge: Math.round(evaluation.depth_score),
        clarity_score: Math.round(evaluation.clarity_score),
        completeness: Math.round((evaluation.depth_score + evaluation.structure_quality) / 2),
        example_quality: evaluation.has_examples ? 8 : 4
      },
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      feedback: `Score: ${evaluation.final_score}%. ${evaluation.improvements[0] ? `To improve: ${evaluation.improvements[0].toLowerCase()}.` : 'Well done!'}`
    });
  }
});

// Alias for comprehensive evaluation (same endpoint, different name for compatibility)
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

// Voice Interview Namespace
// Note: Frontend connects via `io('${WS_URL}/voice-interview')`
// This creates a connection to the /voice-interview namespace.
const voiceInterviewNamespace = io.of('/voice-interview');

voiceInterviewNamespace.on('connection', (socket) => {
  console.log('Client connected to /voice-interview namespace:', socket.id);

  // Handle Init Event
  socket.on('init-voice-interview', (config) => {
    console.log('Received init-voice-interview:', config);
    
    // Simulate processing delay
    setTimeout(() => {
      // Respond with success
      socket.emit('interview-initialized', {
        interviewId: config.interviewId,
        status: 'ready'
      });
      console.log('Sent interview-initialized');

      // Send first question
      setTimeout(() => {
        socket.emit('next-question', {
            question: "Tell me about yourself and your background.",
            audio: "", // Text-only for now
            isFollowUp: false,
            expectedDuration: 60,
            currentProgress: {
                questionsAsked: 1,
                maxQuestions: config.maxQuestions || 5
            }
        });
        console.log('Sent first question');
      }, 1000);
    }, 1000);
  });

  // Handle Recording Start
  socket.on('start-recording', (data) => {
    console.log('Start recording for:', data.interviewId);
  });

  // Handle Audio Chunk
  socket.on('audio-chunk', (data) => {
    // In a real app, stream this to STT service
    // console.log('Received audio chunk for:', data.interviewId);
  });

  // Handle Recording Stop
  socket.on('stop-recording', (data) => {
    console.log('Stop recording for:', data.interviewId);
    
    // Simulate AI processing and response
    setTimeout(() => {
        // Send mock evaluation
        socket.emit('evaluation', {
            score: 85,
            feedback: "That was a good introduction. You covered your background well.",
            keyPointsCovered: ["Background", "Experience", "Skills"],
            missedPoints: ["Specific achievements"],
            fillerWordsCount: 2
        });
        console.log('Sent evaluation');

        // Send next question after evaluation
        // Send next question after evaluation
        setTimeout(() => {
             socket.emit('next-question', {
                question: "What is your greatest strength?",
                audio: "",
                isFollowUp: false,
                expectedDuration: 60,
                currentProgress: {
                    questionsAsked: 2,
                    maxQuestions: 5
                }
            });
            console.log('Sent next question');
        }, 3000);
    }, 2000);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected from /voice-interview namespace:', socket.id);
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
