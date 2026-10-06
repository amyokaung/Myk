import React, {useMemo, useState} from 'react';
import MykAI from './native/MykAI';
import {chatWithOpenRouter} from './openrouterApi';
import {addLearningExample, deleteLearningExample, exportLearningJsonl, loadLearningExamples, saveLearningExamples, type LearningExample} from './learning';

interface OpenRouterLesson {
  question: string;
  idealAnswer: string;
  tags: string[];
}

interface Props {
  modelName: string;
  modelsCount: number;
  settings: {
    contextSize: number;
    threads: number;
    temperature: number;
    maxTokens: number;
    startupTimeoutSeconds: number;
    responseTimeoutSeconds: number;
  };
  openRouterApiKey: string;
  teacherModel: string;
  teacherModelName: string;
  teacherReady: boolean;
  onOpenRouterKeyNeeded: () => void;
}

function cleanJson(raw: string) {
  return raw.replace(/^\uFEFF/, '').trim()
    .replace(/^\`\`\`json\s*/i, '')
    .replace(/^\`\`\`\s*/i, '')
    .replace(/\s*\`\`\`$/i, '');
}

export default function LearningLab({
  modelName,
  settings,
  openRouterApiKey,
  teacherModel,
  teacherModelName,
  teacherReady,
  onOpenRouterKeyNeeded,
}: Props) {
  const [topic, setTopic] = useState('');
  const [autoLearn, setAutoLearn] = useState(true);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');
  const [lesson, setLesson] = useState<OpenRouterLesson | null>(null);
  const [padaukAnswer, setPadaukAnswer] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [examples, setExamples] = useState<LearningExample[]>(() => loadLearningExamples());

  const approved = useMemo(() => examples.filter(x => x.status === 'approved'), [examples]);

  const approvedContext = useMemo(() => approved.slice(0, 40).map(x =>
    'Q: ' + x.question + '\nA: ' + x.idealAnswer
  ).join('\n\n'), [approved]);

  const startLearning = async () => {
    if (!openRouterApiKey.trim()) {
      onOpenRouterKeyNeeded();
      return;
    }
    if (!teacherReady || !teacherModel) {
      setStatus('❌ အရင်ဆုံး Settings မှာ Gemini သို့မဟုတ် ChatGPT model ကို Test လုပ်ပြီး WORKS ဖြစ်အောင်လုပ်ပါ။');
      return;
    }
    if (!modelName.toLowerCase().includes('padauk')) {
      setStatus('❌ Padauk GGUF ကို Models မှာ Active လုပ်ပြီးမှ သင်ပေးပါ။');
      return;
    }
    if (!topic.trim() || working) return;

    setWorking(true);
    setStatus('👨‍🏫 ' + teacherModelName + ' က Padauk အတွက် lesson ပြင်ဆင်နေပါတယ်…');
    setLesson(null);
    setPadaukAnswer('');
    setScore(null);
    setFeedback('');

    try {
      const lessonPrompt = [
        'You are the expert teacher for a Burmese-first local student model named Padauk.',
        'Teach the student one useful, factual, reusable lesson about the requested topic.',
        'Return ONLY valid JSON with keys: question, idealAnswer, tags.',
        'Write the question and idealAnswer naturally in Burmese when the topic is Burmese.',
        'The idealAnswer must contain the actual knowledge Padauk should remember, not meta commentary.',
        'Be accurate, practical, concise, and avoid invented facts.',
        'Topic: ' + topic.trim(),
      ].join('\n');

      const teacherResult = await chatWithOpenRouter({
        apiKey: openRouterApiKey,
        model: teacherModel,
        message: lessonPrompt,
        maxTokens: 650,
        temperature: 0.15,
      });

      const nextLesson = JSON.parse(cleanJson(teacherResult.reply)) as OpenRouterLesson;
      if (!nextLesson.question || !nextLesson.idealAnswer) {
        throw new Error('Teacher lesson format မမှန်ပါ။');
      }
      nextLesson.tags = Array.isArray(nextLesson.tags) ? nextLesson.tags.map(String).slice(0, 8) : [];
      setLesson(nextLesson);

      setStatus('🎓 Padauk က lesson ကို မသင်ခင် အရင်စမ်းဖြေနေပါတယ်…');
      const padaukResult = await MykAI.chat({
        message: nextLesson.question,
        modelName,
        historyJson: '[]',
        contextSize: Math.min(2048, Math.max(512, settings.contextSize)),
        threads: Math.min(8, Math.max(1, settings.threads)),
        temperature: settings.temperature,
        maxTokens: Math.max(256, settings.maxTokens),
        startupTimeoutSeconds: Math.max(300, settings.startupTimeoutSeconds),
        responseTimeoutSeconds: Math.max(60, settings.responseTimeoutSeconds),
        thinkingMode: false,
        learnedContext: approvedContext,
      });
      const answer = (padaukResult.reply || '').trim();
      setPadaukAnswer(answer);

      setStatus('⚖️ Padauk အဖြေကို teacher နဲ့ အကဲဖြတ်နေပါတယ်…');
      const judgePrompt = [
        'You are a strict but fair teacher evaluating a Burmese local student model named Padauk.',
        'Compare the student answer with the teacher lesson.',
        'Score 0-100 for factual correctness, relevance, Burmese naturalness, and completeness.',
        'Return ONLY valid JSON with keys: score, feedback.',
        'Do not punish different wording when the meaning is correct.',
        'Question: ' + nextLesson.question,
        'Teacher ideal answer: ' + nextLesson.idealAnswer,
        'Padauk answer: ' + answer,
      ].join('\n');

      const judgeRaw = await chatWithOpenRouter({
        apiKey: openRouterApiKey,
        model: teacherModel,
        message: judgePrompt,
        maxTokens: 260,
        temperature: 0.05,
      });
      const judgedJson = JSON.parse(cleanJson(judgeRaw.reply));
      const judged = {
        score: Math.max(0, Math.min(100, Number(judgedJson.score) || 0)),
        feedback: String(judgedJson.feedback || ''),
      };
      setScore(judged.score);
      setFeedback(judged.feedback);

      const item: LearningExample = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        topic: topic.trim(),
        question: nextLesson.question,
        idealAnswer: nextLesson.idealAnswer,
        mykAnswer: answer,
        score: judged.score,
        feedback: judged.feedback,
        status: autoLearn && judged.score >= 80 ? 'approved' : 'pending',
        createdAt: Date.now(),
      };
      addLearningExample(item);
      const next = [item, ...examples].slice(0, 500);
      setExamples(next);
      setStatus(autoLearn && judged.score >= 80
        ? '✓ Teacher lesson ကို Padauk Learning Memory ထဲထည့်ပြီးပါပြီ။'
        : 'Review လုပ်ပြီး Approve လုပ်ရင် Padauk က နောက် chat တွေမှာ ဒီ knowledge ကို reference အဖြစ်သုံးပါမယ်။');
    } catch (error) {
      setStatus('❌ ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setWorking(false);
    }
  };

  const approve = (id: string) => {
    const next = examples.map(x => x.id === id ? {...x, status: 'approved' as const} : x);
    setExamples(next);
    saveLearningExamples(next);
  };

  const reject = (id: string) => {
    const next = examples.map(x => x.id === id ? {...x, status: 'rejected' as const} : x);
    setExamples(next);
    saveLearningExamples(next);
  };

  const remove = (id: string) => {
    deleteLearningExample(id);
    setExamples(current => current.filter(x => x.id !== id));
  };

  const exportJsonl = () => {
    const jsonl = exportLearningJsonl(examples);
    if (!jsonl) {
      setStatus('Approved lesson မရှိသေးပါ။');
      return;
    }
    const blob = new Blob([jsonl], {type: 'application/jsonl;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'myk-padauk-teacher-dataset.jsonl';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('✓ Padauk teacher dataset export ပြီးပါပြီ။');
  };

  return (
    <section style={{padding:'18px 15px 120px'}}>
      <div style={{padding:'20px',borderRadius:22,background:'linear-gradient(145deg,#14152a,#10151f)',border:'1px solid #292d4b',boxShadow:'0 18px 50px rgba(0,0,0,.25)'}}>
        <div style={{fontSize:10,color:'#8f8cff',letterSpacing:1.5,fontWeight:800}}>PADАUK TEACHER LAB</div>
        <div style={{fontSize:25,fontWeight:850,marginTop:5}}>👨‍🏫 Padauk ကို စာသင်မယ်</div>
        <div style={{fontSize:12,color:'#8d97aa',lineHeight:1.6,marginTop:5}}>
          Gemini / ChatGPT က <b>ဆရာ</b>၊ Padauk က <b>ကျောင်းသား</b> ဖြစ်ပါတယ်။ ဆရာက lesson ပြင်၊ Padauk ကို စမ်း၊ အမှတ်ပေးပြီး approved knowledge ကို ဖုန်းထဲမှာ Learning Memory အဖြစ် သိမ်းပါမယ်။
        </div>

        <div style={{marginTop:14,padding:12,borderRadius:13,background:'#0b1019',border:'1px solid #20283a'}}>
          <div style={{fontSize:9,color:'#717c90'}}>TEACHER</div>
          <div style={{fontSize:13,fontWeight:800,marginTop:4}}>{teacherReady ? teacherModelName : 'Gemini / ChatGPT model ကို Test လုပ်ရန်လိုသည်'}</div>
          <div style={{fontSize:10,color:teacherReady?'#69db9b':'#d6b86a',marginTop:4}}>{teacherReady ? '✓ WORKS' : 'Not verified'}</div>
        </div>

        <div style={{marginTop:10,padding:12,borderRadius:13,background:'#0b1019',border:'1px solid #20283a'}}>
          <div style={{fontSize:9,color:'#717c90'}}>STUDENT</div>
          <div style={{fontSize:13,fontWeight:800,marginTop:4}}>{modelName}</div>
          <div style={{fontSize:10,color:modelName.toLowerCase().includes('padauk')?'#69db9b':'#ff9da7',marginTop:4}}>{modelName.toLowerCase().includes('padauk') ? '✓ Padauk Active' : '⚠ Padauk ကို Active လုပ်ပါ'}</div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:12}}>
          <div style={{padding:11,borderRadius:13,background:'#0b1019',border:'1px solid #20283a'}}><div style={{fontSize:9,color:'#717c90'}}>APPROVED MEMORY</div><div style={{fontSize:19,fontWeight:800,marginTop:3}}>{approved.length}</div></div>
          <div style={{padding:11,borderRadius:13,background:'#0b1019',border:'1px solid #20283a'}}><div style={{fontSize:9,color:'#717c90'}}>LESSONS</div><div style={{fontSize:19,fontWeight:800,marginTop:3}}>{examples.length}</div></div>
        </div>

        <div style={{marginTop:16,padding:14,borderRadius:15,background:'#0c1119',border:'1px solid #222b3c'}}>
          <div style={{fontSize:11,fontWeight:800,color:'#aeb8ca'}}>ဆရာက ဘာသင်ပေးမလဲ?</div>
          <textarea value={topic} onChange={e=>setTopic(e.target.value)} placeholder="ဥပမာ — မြန်မာနိုင်ငံသမိုင်း၊ Python အခြေခံ၊ ငွေကြေးစီမံခန့်ခွဲမှု…" style={{width:'100%',boxSizing:'border-box',marginTop:9,minHeight:92,resize:'vertical',borderRadius:12,border:'1px solid #2b3446',background:'#080d15',color:'#fff',padding:12,outline:0,fontFamily:'inherit',fontSize:13,lineHeight:1.6}} />
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:10}}>
            <div><div style={{fontSize:12,fontWeight:750}}>Auto Learn</div><div style={{fontSize:10,color:'#707b8e'}}>80+ score ရရင် auto approve</div></div>
            <button onClick={()=>setAutoLearn(v=>!v)} style={{width:48,height:28,border:0,borderRadius:20,background:autoLearn?'#6658e8':'#28303d',padding:3}}><span style={{display:'block',width:22,height:22,borderRadius:99,background:'#fff',transform:autoLearn?'translateX(20px)':'translateX(0)',transition:'transform .18s'}}/></button>
          </div>
          <button onClick={startLearning} disabled={working} style={{marginTop:12,width:'100%',padding:13,border:0,borderRadius:13,background:working?'#242b38':'linear-gradient(135deg,#7c5cff,#4f8cff)',color:'#fff',fontWeight:800}}>{working?'👨‍🏫 သင်ကြားနေပါတယ်…':'👨‍🏫 Teach Padauk'}</button>
          {status && <div style={{marginTop:10,fontSize:11,color:status.startsWith('❌')?'#ff9da7':'#9da8bb',lineHeight:1.5}}>{status}</div>}
        </div>

        {lesson && (
          <div style={{marginTop:12,padding:14,borderRadius:15,background:'#0c1119',border:'1px solid #242d40'}}>
            <div style={{fontSize:9,color:'#7f899b'}}>TEACHER LESSON</div>
            <div style={{marginTop:6,fontWeight:750,lineHeight:1.6}}>{lesson.question}</div>
            <div style={{fontSize:9,color:'#7f899b',marginTop:13}}>PADAUK ANSWER</div>
            <div style={{marginTop:6,color:'#cbd3df',fontSize:12,lineHeight:1.65,whiteSpace:'pre-wrap'}}>{padaukAnswer || '—'}</div>
            <div style={{display:'flex',gap:8,alignItems:'center',marginTop:13}}>
              <div style={{fontSize:25,fontWeight:850}}>{score === null ? '—' : score}</div>
              <div style={{fontSize:10,color:'#7f899b'}}> / 100<br/>Teacher score</div>
            </div>
            {feedback && <div style={{marginTop:8,fontSize:11,color:'#9ba6b8',lineHeight:1.55}}>{feedback}</div>}
          </div>
        )}
      </div>

      <div style={{marginTop:14,padding:16,borderRadius:20,background:'#10151f',border:'1px solid #202837'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
          <div><div style={{fontSize:16,fontWeight:800}}>📚 Padauk Learning Memory</div><div style={{fontSize:10,color:'#717c90',marginTop:4}}>Approved knowledge ကို Padauk chat မှာ reference အဖြစ် ထည့်ပေးမယ်။ Model weights ကို တိုက်ရိုက်ပြန် train တာမဟုတ်ပါ။</div></div>
          <button onClick={exportJsonl} style={{padding:'8px 10px',borderRadius:10,border:'1px solid #30394a',background:'#151b26',color:'#d6dce7',fontSize:10}}>Export</button>
        </div>
        {examples.length === 0 && <div style={{padding:'28px 8px',textAlign:'center',color:'#687387',fontSize:12}}>သင်ခန်းစာ မရှိသေးပါ။</div>}
        {examples.slice(0,20).map(item=>(
          <div key={item.id} style={{marginTop:10,padding:13,borderRadius:14,background:'#0b1018',border:'1px solid #202938'}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
              <div style={{fontSize:9,color:item.status==='approved'?'#69db9b':item.status==='rejected'?'#ff8f9a':'#d6b86a',fontWeight:800}}>{item.status.toUpperCase()} · {item.score ?? 0}/100</div>
              <button onClick={()=>remove(item.id)} style={{border:0,background:'transparent',color:'#657085',fontSize:12}}>✕</button>
            </div>
            <div style={{fontSize:12,fontWeight:700,marginTop:7,lineHeight:1.5}}>{item.topic}</div>
            <div style={{fontSize:11,color:'#9aa5b7',marginTop:5,lineHeight:1.5}}>{item.question}</div>
            {item.status==='pending' && <div style={{display:'flex',gap:7,marginTop:9}}><button onClick={()=>approve(item.id)} style={{flex:1,padding:9,borderRadius:9,border:0,background:'#183a2a',color:'#9df0bd',fontWeight:750,fontSize:11}}>✓ Approve</button><button onClick={()=>reject(item.id)} style={{flex:1,padding:9,borderRadius:9,border:'1px solid #4b2b31',background:'#201419',color:'#ff9fa8',fontSize:11}}>Reject</button></div>}
          </div>
        ))}
      </div>
    </section>
  );
}
