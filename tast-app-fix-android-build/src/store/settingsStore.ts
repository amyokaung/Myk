import {create} from 'zustand';

interface SettingsState {
  temperature: number;
  contextSize: number;
  maxTokens: number;
  setTemperature: (value: number) => void;
  setContextSize: (value: number) => void;
  setMaxTokens: (value: number) => void;
}

export const useSettingsStore = create<SettingsState>(set => ({
  temperature: 0.7,
  contextSize: 4096,
  maxTokens: 512,
  setTemperature: value => set({temperature: value}),
  setContextSize: value => set({contextSize: value}),
  setMaxTokens: value => set({maxTokens: value}),
}));
