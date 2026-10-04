export interface LearningExample {
  id: string;
  topic: string;
  question: string;
  idealAnswer: string;
  mykAnswer?: string;
  score?: number;
  feedback?: string;
  status: 'approved' | 'rejected' | 'pending';
  createdAt: number;
}

const KEY = 'myk-learning-examples';

export function loadLearningExamples(): LearningExample[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLearningExamples(items: LearningExample[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function addLearningExample(item: LearningExample) {
  const items = loadLearningExamples();
  saveLearningExamples([item, ...items].slice(0, 500));
}

export function deleteLearningExample(id: string) {
  saveLearningExamples(loadLearningExamples().filter(item => item.id !== id));
}

export function exportLearningJsonl(items: LearningExample[]) {
  return items
    .filter(item => item.status === 'approved')
    .map(item => JSON.stringify({
      messages: [
        {role: 'user', content: item.question},
        {role: 'assistant', content: item.idealAnswer}
      ]
    }))
    .join('\n');
}
