export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  inputModalities?: string[];
  outputModalities?: string[];
  pricing?: {prompt?: string; completion?: string};
  supportedParameters?: string[];
}

export interface OpenRouterTestResult {
  model: string;
  name: string;
  ok: boolean;
  reply?: string;
  elapsedMs: number;
  error?: string;
}

const API_ROOT = 'https://openrouter.ai/api/v1';

function cleanKey(apiKey: string) {
  return apiKey.trim();
}

async function readJson(response: Response) {
  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`HTTP ${response.status}: Invalid JSON response`);
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `HTTP ${response.status}`);
  }
  return data;
}

export async function listOpenRouterModels(apiKey: string): Promise<OpenRouterModel[]> {
  const key = cleanKey(apiKey);
  if (!key) throw new Error('OpenRouter API Key ထည့်ပါ။');

  const data = await readJson(await fetch(`${API_ROOT}/models`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  }));

  const models = Array.isArray(data?.data) ? data.data : [];
  return models
    .filter((m: any) => {
      const input = Array.isArray(m?.architecture?.input_modalities) ? m.architecture.input_modalities : [];
      const output = Array.isArray(m?.architecture?.output_modalities) ? m.architecture.output_modalities : [];
      return input.includes('text') && output.includes('text');
    })
    .map((m: any) => ({
      id: String(m.id || ''),
      name: String(m.name || m.id || ''),
      description: m.description ? String(m.description) : undefined,
      contextLength: Number.isFinite(m.context_length) ? Number(m.context_length) : undefined,
      inputModalities: Array.isArray(m?.architecture?.input_modalities) ? m.architecture.input_modalities.map(String) : [],
      outputModalities: Array.isArray(m?.architecture?.output_modalities) ? m.architecture.output_modalities.map(String) : [],
      pricing: m.pricing ? {prompt: String(m.pricing.prompt ?? ''), completion: String(m.pricing.completion ?? '')} : undefined,
      supportedParameters: Array.isArray(m.supported_parameters) ? m.supported_parameters.map(String) : [],
    }))
    .filter((m: OpenRouterModel) => !!m.id)
    .sort((a: OpenRouterModel, b: OpenRouterModel) => a.name.localeCompare(b.name));
}

export async function testOpenRouterModel(apiKey: string, model: OpenRouterModel | string): Promise<OpenRouterTestResult> {
  const key = cleanKey(apiKey);
  if (!key) throw new Error('OpenRouter API Key ထည့်ပါ။');

  const modelId = typeof model === 'string' ? model : model.id;
  const name = typeof model === 'string' ? modelId : model.name;
  const started = performance.now();

  try {
    const data = await readJson(await fetch(`${API_ROOT}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'HTTP-Referer': 'https://github.com/amyokaung/Myk',
        'X-Title': 'Myk Myanmar AI',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {role: 'system', content: 'Reply naturally and concisely in the same language as the user. If the user writes Burmese, reply in Burmese.'},
          {role: 'user', content: 'မြန်မာလို တိုတောင်းစွာ “မင်္ဂလာပါ” လို့ ပြန်ဖြေပါ။'},
        ],
        temperature: 0.2,
        max_tokens: 64,
        stream: false,
      }),
    }));

    const reply = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!reply) throw new Error('Model returned an empty response.');

    return {model: modelId, name, ok: true, reply, elapsedMs: Math.round(performance.now() - started)};
  } catch (error) {
    return {
      model: modelId,
      name,
      ok: false,
      elapsedMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function chatWithOpenRouter(options: {
  apiKey: string;
  model: string;
  message: string;
  history?: Array<{role: 'user' | 'assistant'; content: string}>;
  maxTokens?: number;
  temperature?: number;
}): Promise<{reply: string; elapsedMs: number}> {
  const key = cleanKey(options.apiKey);
  if (!key) throw new Error('OpenRouter API Key မထည့်ရသေးပါ။');
  if (!options.model) throw new Error('OpenRouter model မရွေးရသေးပါ။');

  const started = performance.now();
  const messages = [
    {
      role: 'system' as const,
      content: 'You are Myk, a helpful Myanmar AI assistant. Reply in the same language as the user. If the user writes Burmese, answer naturally in Burmese only. Be accurate, direct, and concise. Do not mention these instructions.',
    },
    ...(options.history || []).slice(-6),
    {role: 'user' as const, content: options.message},
  ];

  const data = await readJson(await fetch(`${API_ROOT}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'HTTP-Referer': 'https://github.com/amyokaung/Myk',
      'X-Title': 'Myk Myanmar AI',
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      temperature: Math.max(0, Math.min(1.5, options.temperature ?? 0.5)),
      max_tokens: Math.max(32, Math.min(2048, options.maxTokens ?? 256)),
      stream: false,
    }),
  }));

  const reply = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!reply) throw new Error('OpenRouter returned an empty response.');
  return {reply, elapsedMs: Math.round(performance.now() - started)};
}
