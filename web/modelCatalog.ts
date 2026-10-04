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
    id: 'qwen3-4b-q4km',
    name: 'Qwen3 4B · Q4_K_M',
    filename: 'Qwen3-4B-Q4_K_M.gguf',
    sizeBytes: 2497000000,
    description: 'အရွယ်အစားနဲ့ အရည်အသွေးကို မျှတစွာထားတဲ့ general-purpose chat model။ ဖုန်းအတွက် ပထမဆုံးစမ်းဖို့ သင့်တော်။',
    tags: ['4B', '2.5 GB', 'Chat', 'Recommended'],
    recommended: true,
    url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
  },
  {
    id: 'qwen3-4b-q5km',
    name: 'Qwen3 4B · Q5_K_M',
    filename: 'Qwen3-4B-Q5_K_M.gguf',
    sizeBytes: 2890000000,
    description: '4B version ထဲမှာ quality ပိုမြင့်တဲ့ quantization။ Storage လုံလောက်ရင် စမ်းသင့်။',
    tags: ['4B', '2.9 GB', 'Higher Quality'],
    recommended: false,
    url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q5_K_M.gguf',
  },
  {
    id: 'qwen3-8b-q4km',
    name: 'Qwen3 8B · Q4_K_M',
    filename: 'Qwen3-8B-Q4_K_M.gguf',
    sizeBytes: 5030000000,
    description: 'ပိုကြီးတဲ့ 8B model။ Reasoning နဲ့ conversation quality ပိုလိုချင်သူတွေအတွက်၊ ဖုန်းမှာ ပိုနှေးနိုင်။',
    tags: ['8B', '5.0 GB', 'Better Reasoning'],
    recommended: true,
    url: 'https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf',
  },
];

export function formatModelSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB';
  return (bytes / 1024 ** 2).toFixed(1) + ' MB';
}
