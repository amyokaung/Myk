import {create} from 'zustand';
import {AIModel} from '../types/model';

interface ModelState {
  models: AIModel[];
  activeModel: AIModel | null;
  setModels: (models: AIModel[]) => void;
  setActiveModel: (model: AIModel | null) => void;
}

export const useModelStore = create<ModelState>(set => ({
  models: [],
  activeModel: null,
  setModels: models => set({models}),
  setActiveModel: model => set({activeModel: model}),
}));
