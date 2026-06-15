import { openai } from '../utils/ai';

export interface ParsedResume {
  name: string | null;
  currentRole: string | null;
  yearsExperience: number | null;
  skills: string[];
  topProjects: { name: string; description: string; tech: string[] }[];
  education: { degree: string; field: string; institution: string }[];
  companies: string[];
  achievements: string[];
  rawText: string;
}

export interface ParsedJD {
  companyName: string | null;
  roleName: string | null;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  responsibilities: string[];
  seniorityLevel: string | null;
  techStack: string[];
  rawText: string;
}

// In-memory cache for parsed resumes and JDs
const parserCache = new Map<string, ParsedResume | ParsedJD>();

// Deterministic 32-bit string hashing function
function getDocHash(text: string): string {
  const prefix = text.slice(0, 100);
  let hash = 0;
  for (let i = 0; i < prefix.length; i++) {
    hash = (hash << 5) - hash + prefix.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString();
}

export async function parseResume(resumeText: string): Promise<ParsedResume> {
  const cleanText = resumeText || "";
  const hash = getDocHash(cleanText);
  if (parserCache.has(hash)) {
    console.log("🎯 Serving parsed resume from cache");
    return parserCache.get(hash) as ParsedResume;
  }

  console.log("📡 Parsing resume via OpenAI GPT-4o...");
  const truncatedText = cleanText.slice(0, 4000);

  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: `Extract structured information from this resume. Return ONLY valid JSON matching this exact schema, no other text:
{
  "name": string | null,
  "currentRole": string | null,
  "yearsExperience": number | null,
  "skills": string[],
  "topProjects": [{ "name": string, "description": string, "tech": string[] }],
  "education": [{ "degree": string, "field": string, "institution": string }],
  "companies": string[],
  "achievements": string[]
}

Resume text:
${truncatedText}`
      }
    ],
    max_tokens: 800,
    temperature: 0,
    response_format: { type: 'json_object' }
  });

  try {
    const content = res.choices[0].message.content;
    const parsed = JSON.parse(content);
    const result: ParsedResume = {
      name: parsed.name ?? null,
      currentRole: parsed.currentRole ?? null,
      yearsExperience: typeof parsed.yearsExperience === 'number' ? parsed.yearsExperience : null,
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      topProjects: Array.isArray(parsed.topProjects) ? parsed.topProjects : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
      companies: Array.isArray(parsed.companies) ? parsed.companies : [],
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
      rawText: cleanText
    };
    parserCache.set(hash, result);
    return result;
  } catch (err) {
    console.error("❌ Failed to parse resume JSON response:", err);
    return {
      name: null,
      currentRole: null,
      yearsExperience: null,
      skills: [],
      topProjects: [],
      education: [],
      companies: [],
      achievements: [],
      rawText: cleanText
    };
  }
}

export async function parseJD(jdText: string): Promise<ParsedJD> {
  const cleanText = jdText || "";
  const hash = getDocHash(cleanText);
  if (parserCache.has(hash)) {
    console.log("🎯 Serving parsed Job Description from cache");
    return parserCache.get(hash) as ParsedJD;
  }

  console.log("📡 Parsing JD via OpenAI GPT-4o...");
  const truncatedText = cleanText.slice(0, 3000);

  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: `Extract structured information from this job description. Return ONLY valid JSON matching this exact schema, no other text:
{
  "companyName": string | null,
  "roleName": string | null,
  "requiredSkills": string[],
  "niceToHaveSkills": string[],
  "responsibilities": string[],
  "seniorityLevel": string | null,
  "techStack": string[]
}

Job description:
${truncatedText}`
      }
    ],
    max_tokens: 800,
    temperature: 0,
    response_format: { type: 'json_object' }
  });

  try {
    const content = res.choices[0].message.content;
    const parsed = JSON.parse(content);
    const result: ParsedJD = {
      companyName: parsed.companyName ?? null,
      roleName: parsed.roleName ?? null,
      requiredSkills: Array.isArray(parsed.requiredSkills) ? parsed.requiredSkills : [],
      niceToHaveSkills: Array.isArray(parsed.niceToHaveSkills) ? parsed.niceToHaveSkills : [],
      responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [],
      seniorityLevel: parsed.seniorityLevel ?? null,
      techStack: Array.isArray(parsed.techStack) ? parsed.techStack : [],
      rawText: cleanText
    };
    parserCache.set(hash, result);
    return result;
  } catch (err) {
    console.error("❌ Failed to parse JD JSON response:", err);
    return {
      companyName: null,
      roleName: null,
      requiredSkills: [],
      niceToHaveSkills: [],
      responsibilities: [],
      seniorityLevel: null,
      techStack: [],
      rawText: cleanText
    };
  }
}
