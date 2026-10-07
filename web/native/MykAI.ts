import {registerPlugin} from '@capacitor/core';

export interface MykAIPlugin {
  chat(options: {
    message: string;
    modelName: string;
    historyJson?: string;
    contextSize?: number;
    threads?: number;
    temperature?: number;
    maxTokens?: number;
    startupTimeoutSeconds?: number;
    responseTimeoutSeconds?: number;
    thinkingMode?: boolean;
    learnedContext?: string;
  }): Promise<{reply: string; thinkingSummary?: string; startupMs?: number; generationMs?: number; totalMs?: number}>;
  verifyModel(options: {modelName: string}): Promise<{
    name: string;
    sizeBytes: number;
    sizeGB: string;
    bytesHashed: number;
    magic: string;
    version: number;
    sha256: string;
    basicValid: boolean;
  }>;
  stop(): Promise<void>;
}

export default registerPlugin<MykAIPlugin>('MykAI');
