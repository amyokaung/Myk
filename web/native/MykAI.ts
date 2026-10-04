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
    learnedContext?: string;
  }): Promise<{reply: string}>;
  stop(): Promise<void>;
}

export default registerPlugin<MykAIPlugin>('MykAI');
