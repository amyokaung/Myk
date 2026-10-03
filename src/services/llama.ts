import {NativeModules} from 'react-native';

const {LlamaServer} = NativeModules;

const DEFAULT_PORT = 8080;
const DEFAULT_THREADS = 4;

export type LlamaSettings = {
  temperature: number;
  maxTokens: number;
  contextSize?: number;
};

function requireServer() {
  if (!LlamaServer) {
    throw new Error(
      'Local AI server is not available in this build.',
    );
  }
  return LlamaServer;
}

export async function startServer(
  modelPath: string,
  contextSize = 2048,
) {
  const server = requireServer();

  return server.start(
    modelPath,
    DEFAULT_PORT,
    DEFAULT_THREADS,
    contextSize,
  );
}

export async function isServerRunning() {
  if (!LlamaServer) {
    return false;
  }

  return Boolean(await LlamaServer.isRunning());
}

export async function stopGeneration() {
  if (!LlamaServer) {
    return;
  }

  try {
    await LlamaServer.stop();
  } catch {
    // The server may already have exited.
  }
}

export async function generate(
  prompt: string,
  settings: LlamaSettings,
  onToken: (token: string) => void,
  onComplete?: () => void,
  onError?: (error: string) => void,
) {
  try {
    if (!LlamaServer) {
      throw new Error(
        'Local AI server is not available.',
      );
    }

    const response = await fetch(
      `http://127.0.0.1:${DEFAULT_PORT}/completion`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          n_predict: settings.maxTokens,
          temperature: settings.temperature,
          stream: false,
        }),
      },
    );

    const body = await response.text();

    if (!response.ok) {
      throw new Error(
        `llama-server HTTP ${response.status}: ${body}`,
      );
    }

    let data: {content?: string; error?: string};

    try {
      data = JSON.parse(body);
    } catch {
      throw new Error(
        'llama-server returned invalid JSON.',
      );
    }

    if (data.error) {
      throw new Error(data.error);
    }

    const content = String(data.content ?? '');

    if (content) {
      onToken(content);
    }

    onComplete?.();

    return content;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    onError?.(message);
    throw error;
  }
}
