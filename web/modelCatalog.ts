export interface DownloadableModel {
  id: string;
  name: string;
  filename: string;
  sizeBytes: number;
  description: string;
  tags: string[];
  recommended: boolean;
  url: string;
}

export const MODEL_CATALOG: DownloadableModel[] = [
  {
    id: 'qwen3-1.7b-q4km',
    name: 'Qwen3 1.7B · Q4_K_M',
    filename: 'Qwen3-1.7B-Q4_K_M.gguf',
    sizeBytes: 1282000000,
    description: 'မြန်မြန်ဆန်ဆန် local chat လုပ်ဖို့ အရွယ်သေး model။ 8GB RAM ဖုန်းအတွက် အကောင်းဆုံး starting point တစ်ခု။',
    tags: ['1.7B', '1.3 GB', 'Fast', 'Recommended'],
    recommended: true,
    url: 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf',
  },
  {
    id: 'qwen3-1.7b-q5km',
    name: 'Qwen3 1.7B · Q5_K_M',
    filename: 'Qwen3-1.7B-Q5_K_M.gguf',
    sizeBytes: 1472000000,
    description: '1.7B ထဲမှာ quality ပိုကောင်းတဲ့ quantization။ Speed နဲ့ quality ကို သင့်တင့်အောင်ထားချင်ရင် စမ်းပါ။',
    tags: ['1.7B', '1.5 GB', 'Higher Quality'],
    recommended: false,
    url: 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q5_K_M.gguf',
  },
  {
    id: 'qwen3-4b-q4km',
    name: 'Qwen3 4B · Q4_K_M',
    filename: 'Qwen3-4B-Q4_K_M.gguf',
    sizeBytes: 2497000000,
    description: 'General-purpose chat အတွက် quality/speed balance ကောင်းတဲ့ model။ Myk ရဲ့ main recommendation။',
    tags: ['4B', '2.5 GB', 'Chat', 'Recommended'],
    recommended: true,
    url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
  },
  {
    id: 'qwen3-4b-q5km',
    name: 'Qwen3 4B · Q5_K_M',
    filename: 'Qwen3-4B-Q5_K_M.gguf',
    sizeBytes: 2890000000,
    description: 'Qwen3 4B ရဲ့ quality ပိုမြင့်တဲ့ quantization။ 8GB RAM ဖုန်းမှာ storage/RAM လုံလောက်ရင် စမ်းရန်။',
    tags: ['4B', '2.9 GB', 'Higher Quality'],
    recommended: false,
    url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q5_K_M.gguf',
  },
  {
    id: 'gemma3-4b-q4km',
    name: 'Gemma 3 4B IT · Q4_K_M',
    filename: 'gemma-3-4b-it-Q4_K_M.gguf',
    sizeBytes: 2490000000,
    description: 'Instruction-tuned multilingual chat model။ Burmese quality ကို Qwen နဲ့ယှဉ်စမ်းဖို့ အရေးကြီးတဲ့ alternative။',
    tags: ['4B', '2.5 GB', 'Multilingual', 'Recommended'],
    recommended: true,
    url: 'https://huggingface.co/unsloth/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf',
  },
  {
    id: 'gemma3-4b-q5km',
    name: 'Gemma 3 4B IT · Q5_K_M',
    filename: 'gemma-3-4b-it-Q5_K_M.gguf',
    sizeBytes: 2830000000,
    description: 'Gemma 3 4B ရဲ့ quality ပိုမြင့်တဲ့ quantization။ Storage လုံလောက်ရင် multilingual chat quality အတွက် စမ်းပါ။',
    tags: ['4B', '2.8 GB', 'Higher Quality'],
    recommended: false,
    url: 'https://huggingface.co/unsloth/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q5_K_M.gguf',
  },
  {
    id: 'padauk-iq1s',
    name: 'AI4Burmese Padauk · IQ1_S · Phone Lite',
    filename: 'ai4burmese-padauk.i1-IQ1_S.gguf',
    sizeBytes: 3290000000,
    description: 'Padauk ရဲ့ အရွယ်အသေးဆုံး community quantization။ Quality လျော့နိုင်ပေမယ့် 5.3GB Q4 ထက် ဖုန်းမှာ စမ်းရန်ပိုသင့်တော်သည်။',
    tags: ['Burmese-first', '7B', '3.29 GB', 'Phone Lite'],
    recommended: false,
    url: 'https://huggingface.co/mradermacher/ai4burmese-padauk-i1-GGUF/resolve/main/ai4burmese-padauk.i1-IQ1_S.gguf',
  },
  {
    id: 'padauk-q4km',
    name: 'AI4Burmese Padauk · Q4_K_M',
    filename: 'ai4burmese-padauk.Q4_K_M.gguf',
    sizeBytes: 5300000000,
    description: 'Burmese-first assistant။ Myanmar context, Burmese intent နဲ့ assistant workflow တွေအတွက် အထူးပြုထားသည်။ 8GB RAM မှာ Heavy/Experimental။',
    tags: ['Burmese-first', '7B', '5.3 GB', 'Experimental'],
    recommended: false,
    url: 'https://huggingface.co/mradermacher/ai4burmese-padauk-GGUF/resolve/main/ai4burmese-padauk.Q4_K_M.gguf',
  },
  {
    id: 'qwen3-8b-q4km',
    name: 'Qwen3 8B · Q4_K_M',
    filename: 'Qwen3-8B-Q4_K_M.gguf',
    sizeBytes: 5030000000,
    description: 'ပိုကြီးတဲ့ general-purpose model။ Reasoning/conversation quality ပိုလိုချင်ရင် စမ်းနိုင်ပေမယ့် 8GB RAM မှာ Heavy။',
    tags: ['8B', '5.0 GB', 'Better Reasoning', 'Heavy'],
    recommended: false,
    url: 'https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf',
  },
];

export function formatModelSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB';
  return (bytes / 1024 ** 2).toFixed(1) + ' MB';
}
