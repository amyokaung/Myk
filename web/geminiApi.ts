export interface GeminiModel {
  name: string;
  baseModelId: string;
  displayName: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
  temperature?: number;
  topP?: number;
  topK?: number;
}

export interface GeminiModelTestResult {
  model: string;
  displayName: string;
  ok: boolean;
  reply?: string;
  elapsedMs: number;
  error?: string;
}

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

function cleanKey(apiKey: string) {
  return apiKey.trim();
}

async function readJson(response: Response) {
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`HTTP ${response.status}: Invalid JSON response`);
  }
  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.status ||
      `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

export async function listGeminiModels(apiKey: string): Promise<GeminiModel[]> {
  const key = cleanKey(apiKey);
  if (!key) throw new Error('Gemini API Key ထည့်ပါ။');

  const models: GeminiModel[] = [];
  let pageToken = '';

  do {
    const url = new URL(`${API_ROOT}/models`);
    url.searchParams.set('key', key);
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const data = await readJson(await fetch(url.toString(), {
      method: 'GET',
      headers: {Accept: 'application/json'},
    }));

    for (const item of data?.models || []) {
      const baseModelId = String(item.baseModelId || item.name?.replace(/^models\//, '') || '');
      const name = String(item.name || '');
      const methods = Array.isArray(item.supportedGenerationMethods)
        ? item.supportedGenerationMethods.map(String)
        : [];

      if (!name || !baseModelId || !methods.includes('generateContent')) continue;

      models.push({
        name,
        baseModelId,
        displayName: String(item.displayName || baseModelId),
        description: item.description ? String(item.description) : undefined,
        inputTokenLimit: Number.isFinite(item.inputTokenLimit) ? Number(item.inputTokenLimit) : undefined,
        outputTokenLimit: Number.isFinite(item.outputTokenLimit) ? Number(item.outputTokenLimit) : undefined,
        supportedGenerationMethods: methods,
        temperature: Number.isFinite(item.temperature) ? Number(item.temperature) : undefined,
        topP: Number.isFinite(item.topP) ? Number(item.topP) : undefined,
        topK: Number.isFinite(item.topK) ? Number(item.topK) : undefined,
      });
    }

    pageToken = String(data?.nextPageToken || '');
  } while (pageToken);

  const unique = new Map<string, GeminiModel>();
  for (const model of models) unique.set(model.baseModelId, model);
  return [...unique.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function testGeminiModel(apiKey: string, model: GeminiModel | string): Promise<GeminiModelTestResult> {
  const key = cleanKey(apiKey);
  if (!key) throw new Error('Gemini API Key ထည့်ပါ။');

  const modelId = typeof model === 'string'
    ? model.replace(/^models\//, '')
    : model.baseModelId;
  const displayName = typeof model === 'string' ? modelId : model.displayName;
  const started = performance.now();

  try {
    const url = new URL(`${API_ROOT}/models/${encodeURIComponent(modelId)}:generateContent`);
    url.searchParams.set('key', key);

    const data = await readJson(await fetch(url.toString(), {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{text: 'မြန်မာလို တိုတောင်းစွာ “မင်္ဂလာပါ” လို့ ပြန်ဖြေပါ။'}],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 64,
        },
      }),
    }));

    const reply = (data?.candidates?.[0]?.content?.parts || [])
      .map((part: any) => part?.text || '')
      .join('')
      .trim();

    if (!reply) {
      throw new Error(
        data?.promptFeedback?.blockReason
          ? `Blocked: ${data.promptFeedback.blockReason}`
          : 'Model returned an empty response.'
      );
    }

    return {
      model: modelId,
      displayName,
      ok: true,
      reply,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      model: modelId,
      displayName,
      ok: false,
      elapsedMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
