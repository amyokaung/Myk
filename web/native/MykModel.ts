import { registerPlugin } from '@capacitor/core';

export interface ModelInfo {
  name: string;
  path: string;
  size: number;
}

export interface MykModelPlugin {
  pickModel(): Promise<ModelInfo>;
  listModels(): Promise<{ models: ModelInfo[] }>;
  deleteModel(options: { name: string }): Promise<void>;
}

const MykModel = registerPlugin<MykModelPlugin>('MykModel');
export default MykModel;
