export interface GeminiLesson {
  question: string;
  idealAnswer: string;
  tags: string[];
}

function parseJson(text: string): any {
  const cleaned = text.replace(/^\uFEFF/, '').trim().replace(/^\`\`\`json\s*/i, '').replace(/^\`\`\`\s*/i, '').replace(/\s*\`\`\`$/i, '');
  return JSON.parse(cleaned);
}

async function geminiInteraction(apiKey: string, input: string): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error('Gemini API key မထည့်ရသေးပါ။ Settings → Gemini API သို့သွားပါ။');

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify({
      model: 'gemini-3.8-flash',
      input,
    }),
  });

  const raw = await response.text();
  if (!response.ok) throw new Error('Gemini API ' + response.status + ': ' + raw.slice(0, 300));

  const data = JSON.parse(raw);
  if (typeof data.output_text === 'string') return data.output_text;

  const steps = Array.isArray(data.steps) ? data.steps : [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const content = Array.isArray(steps[i]?.content) ? steps[i].content : [];
    const text = content.find((x: any) => typeof x?.text === 'string')?.text;
    if (text) return text;
  }
  throw new Error('Gemini response ထဲမှာ စာသားမတွေ့ပါ။');
}

export async function generateLesson(apiKey: string, topic: string): Promise<GeminiLesson> {
  const prompt = [
    'You are the teacher for Myk, a local Myanmar offline AI.',
    'Create ONE high-quality Burmese learning example about the requested topic.',
    'Return ONLY valid JSON with keys: question, idealAnswer, tags.',
    'The question must be natural Burmese when the topic is Burmese.',
    'The idealAnswer must be accurate, useful, concise, and natural Burmese.',
    'Do not include markdown fences.',
    'Topic: ' + topic.trim(),
  ].join('\n');

  const result = parseJson(await geminiInteraction(apiKey, prompt));
  if (!result.question || !result.idealAnswer) throw new Error('Gemini က lesson format မမှန်ပါ။');
  return {
    question: String(result.question),
    idealAnswer: String(result.idealAnswer),
    tags: Array.isArray(result.tags) ? result.tags.map(String).slice(0, 8) : [],
  };
}

export async function judgeLesson(apiKey: string, lesson: GeminiLesson, mykAnswer: string) {
  const prompt = [
    'You are a strict but fair judge evaluating a local AI named Myk.',
    'Compare Myk answer with the ideal answer.',
    'Score 0-100 for factual correctness, relevance, Burmese naturalness, and completeness.',
    'Return ONLY valid JSON with keys: score, feedback.',
    'Do not punish different wording when the meaning is correct.',
    'Question: ' + lesson.question,
    'Ideal answer: ' + lesson.idealAnswer,
    'Myk answer: ' + mykAnswer,
  ].join('\n');

  const result = parseJson(await geminiInteraction(apiKey, prompt));
  return {
    score: Math.max(0, Math.min(100, Number(result.score) || 0)),
    feedback: String(result.feedback || ''),
  };
}
