import { groq } from '../utils/ai';

export interface DifficultyState {
  current: 'easy' | 'medium' | 'hard';
  consecutiveHighScores: number;
  consecutiveLowScores: number;
  escalationHistory: string[];
}

export function shouldEscalate(state: DifficultyState, latestScore: number): boolean {
  return latestScore >= 8 && state.consecutiveHighScores >= 1;
  // 2 consecutive scores of 8+ -> escalate
}

export function shouldDeescalate(state: DifficultyState, latestScore: number): boolean {
  return latestScore <= 3 && state.consecutiveLowScores >= 1;
  // 2 consecutive scores of 3 or below -> de-escalate
}

export function getNextDifficulty(
  current: 'easy' | 'medium' | 'hard',
  direction: 'up' | 'down'
): 'easy' | 'medium' | 'hard' {
  const levels: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
  const idx = levels.indexOf(current);
  if (direction === 'up') return levels[Math.min(idx + 1, 2)];
  return levels[Math.max(idx - 1, 0)];
}

export async function generateAdaptiveFollowUp(
  session: {
    conversationHistory: Array<{ role: 'interviewer' | 'candidate'; content: string }>;
    parsedResume?: any | null;
  },
  newDifficulty: 'easy' | 'medium' | 'hard',
  reason: 'escalate' | 'deescalate',
  systemPrompt: string
): Promise<string> {
  const transition = reason === 'escalate'
    ? "The candidate is performing well. Ask a harder follow-up or introduce a more complex scenario."
    : "The candidate is struggling. Ask a more foundational question to rebuild confidence.";

  console.log(`📡 Generating adaptive follow-up via Groq (new diff: ${newDifficulty}, reason: ${reason})...`);
  const res = await groq.chat.completions.create({
    model: 'llama-3.1-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...session.conversationHistory.map(h => ({
        role: h.role === 'interviewer' ? 'assistant' as const : 'user' as const,
        content: h.content
      })),
      {
        role: 'system',
        content: `[INTERNAL]: ${transition} New difficulty: ${newDifficulty}.
${session.parsedResume ? `Candidate skills for context: ${session.parsedResume.skills.slice(0, 6).join(', ')}` : ''}
Generate the next question only. No preamble.`
      }
    ],
    max_tokens: 100,
    temperature: 0.8
  });

  return res.choices[0].message.content || "Could you describe your experience in details?";
}
