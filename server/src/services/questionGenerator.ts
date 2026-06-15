import { openai } from '../utils/ai';
import { ParsedResume, ParsedJD } from './resumeParser';

export interface SessionConfig {
  domain: string;
  difficulty: string;
  interviewType: string;
  durationMinutes: number;
  maxQuestions: number;
  voice?: string;
}

function buildCandidateContext(resume: ParsedResume | null, jd: ParsedJD | null): string {
  let ctx = '';

  if (resume) {
    ctx += `CANDIDATE PROFILE:
- Name: ${resume.name ?? 'Unknown'}
- Current role: ${resume.currentRole ?? 'Not specified'}
- Experience: ${resume.yearsExperience ?? 'Unknown'} years
- Core skills: ${resume.skills.slice(0, 12).join(', ')}
- Companies worked at: ${resume.companies.join(', ')}
- Key projects: ${resume.topProjects.slice(0, 3).map(p => `${p.name} (${p.tech.join(', ')})`).join('; ')}
- Notable achievements: ${resume.achievements.slice(0, 3).join('; ')}
\n`;
  }

  if (jd) {
    ctx += `TARGET ROLE:
- Company: ${jd.companyName ?? 'Unknown'}
- Role: ${jd.roleName ?? 'Unknown'}
- Required skills: ${jd.requiredSkills.join(', ')}
- Tech stack: ${jd.techStack.join(', ')}
- Seniority: ${jd.seniorityLevel ?? 'Not specified'}
- Key responsibilities: ${jd.responsibilities.slice(0, 4).join('; ')}
\n`;
  }

  return ctx;
}

export async function generatePersonalisedQuestions(
  config: SessionConfig,
  resume: ParsedResume | null,
  jd: ParsedJD | null,
  previousQuestions: string[] = []
): Promise<string[]> {
  const type = config.interviewType || (config as any).type || 'TECHNICAL';
  const count = config.maxQuestions || 5;

  const candidateContext = buildCandidateContext(resume, jd);

  const systemPrompt = `You are generating interview questions for a ${type} interview.
${candidateContext}
Domain: ${config.domain}
Difficulty: ${config.difficulty}
Questions needed: ${count}
Previously asked (do not repeat): ${previousQuestions.join(' | ')}

Generate exactly ${count} questions. Rules:
${resume ? `- Reference the candidate's actual experience. E.g. "I see you worked on ${resume.topProjects[0]?.name || 'a key project'} — walk me through the architecture decisions you made there."` : ''}
${jd ? `- Align questions to the target role's required skills: ${jd.requiredSkills.slice(0, 5).join(', ')}` : ''}
${resume && jd ? `- Identify skill gaps between the resume and JD and probe those specifically` : ''}
- Mix question types: conceptual (30%), experience-based (40%), scenario/hypothetical (30%)
- Each question on its own line, numbered 1. 2. 3. etc.
- No preamble, no explanation, just the numbered questions.`;

  console.log("📡 Generating personalized questions via OpenAI GPT-4o...");
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: systemPrompt
      }
    ],
    max_tokens: 800,
    temperature: 0.7
  });

  const content = res.choices[0].message.content || '';
  const questions = content
    .split('\n')
    .map((line: string) => line.replace(/^\d+[\.\)]\s*/, '').trim()) // strip '1.', '1)' etc.
    .filter((line: string) => line.length > 0);

  return questions.slice(0, count);
}
