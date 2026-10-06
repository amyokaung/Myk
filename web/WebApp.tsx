import React, {useEffect, useState} from 'react';
import MykModel, {type ModelInfo} from './native/MykModel';
import MykAI from './native/MykAI';
import {registerPlugin} from '@capacitor/core';
import {MODEL_CATALOG, formatModelSize, type DownloadableModel} from './modelCatalog';
import LearningLab from './LearningLab';
import {loadLearningExamples} from './learning';
import {chatWithOpenRouter, listOpenRouterModels, testOpenRouterModel, filterTeacherModels, type OpenRouterModel, type OpenRouterTestResult} from './openrouterApi';

interface EngineSettings {
  contextSize: number;
  threads: number;
  temperature: number;
  maxTokens: number;
  startupTimeoutSeconds: number;
  responseTimeoutSeconds: number;
  thinkingMode: boolean;
}

const DEFAULT_SETTINGS: EngineSettings = {
  contextSize: 512,
  threads: 8,
  temperature: 0.5,
  maxTokens: 128,
  startupTimeoutSeconds: 120,
  responseTimeoutSeconds: 30,
  thinkingMode: false,
};

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface MykModelDownloadPlugin {
  downloadModel(options: {name: string; url: string; sizeBytes: number}): Promise<{started: boolean}>;
  getDownloadStatus(): Promise<{downloading: boolean; cancelled: boolean; name: string; bytes: number; total: number; error: string}>;
  cancelDownload(): Promise<void>;
}

const MykModelDownload = registerPlugin<MykModelDownloadPlugin>('MykModel');

type Tab = 'home' | 'localChat' | 'onlineChat' | 'learn' | 'models' | 'settings';
const SETTINGS_KEY = 'myk-engine-settings';
const OPENROUTER_KEY = 'myk-openrouter-api-key';
const OPENROUTER_MODEL_KEY = 'myk-openrouter-model';
const OPENROUTER_TESTED_KEY = 'myk-openrouter-tested-models';

export default function WebApp() {
  const [tab, setTab] = useState<Tab>('home');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [modelName, setModelName] = useState('No GGUF model selected');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [openRouterApiKey, setOpenRouterApiKey] = useState(() => localStorage.getItem(OPENROUTER_KEY) || '');
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
  const [openRouterLoading, setOpenRouterLoading] = useState(false);
  const [openRouterTesting, setOpenRouterTesting] = useState(false);
  const [openRouterSelectedModel, setOpenRouterSelectedModel] = useState(() => localStorage.getItem(OPENROUTER_MODEL_KEY) || '');
  const [openRouterSearch, setOpenRouterSearch] = useState('');
  const [openRouterResult, setOpenRouterResult] = useState<OpenRouterTestResult | null>(null);
  const [openRouterError, setOpenRouterError] = useState('');
  const [testedWorkingIds, setTestedWorkingIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(OPENROUTER_TESTED_KEY) || '[]'); } catch { return []; }
  });
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadBytes, setDownloadBytes] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState(0);
  const [downloadError, setDownloadError] = useState('');
  const [settings, setSettings] = useState<EngineSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved ? {...DEFAULT_SETTINGS, ...JSON.parse(saved)} : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const saveSettings = (next: EngineSettings) => {
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
  };

  const saveOpenRouterKey = () => {
    const key = openRouterApiKey.trim();
    setOpenRouterApiKey(key);
    localStorage.setItem(OPENROUTER_KEY, key);
    setOpenRouterError('');
    setOpenRouterResult(null);
  };

  const discoverOpenRouterModels = async () => {
    const key = openRouterApiKey.trim();
    if (!key) {
      setOpenRouterError('OpenRouter API Key ထည့်ပြီး Save Key ကိုနှိပ်ပါ။');
      return;
    }
    setOpenRouterLoading(true);
    setOpenRouterError('');
    setOpenRouterResult(null);
    try {
      const all = await listOpenRouterModels(key);
      const found = filterTeacherModels(all);
      setOpenRouterModels(found);
      const preferred = localStorage.getItem(OPENROUTER_MODEL_KEY) || '';
      const tested = new Set(testedWorkingIds);
      const next = found.some(m => m.id === preferred)
        ? preferred
        : found.find(m => tested.has(m.id))?.id || found[0]?.id || '';
      setOpenRouterSelectedModel(next);
      if (next) localStorage.setItem(OPENROUTER_MODEL_KEY, next);
      if (!found.length) setOpenRouterError('ဒီ OpenRouter Key နဲ့ text chat model မတွေ့ပါ။');
    } catch (error) {
      setOpenRouterModels([]);
      setOpenRouterSelectedModel('');
      setOpenRouterError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpenRouterLoading(false);
    }
  };

  const runOpenRouterTest = async () => {
    const selected = openRouterModels.find(m => m.id === openRouterSelectedModel);
    if (!selected) {
      setOpenRouterError('အရင်ဆုံး model list ကို Load လုပ်ပြီး model ရွေးပါ။');
      return;
    }
    setOpenRouterTesting(true);
    setOpenRouterError('');
    try {
      const result = await testOpenRouterModel(openRouterApiKey, selected);
      setOpenRouterResult(result);
      if (result.ok) {
        const next = Array.from(new Set([...testedWorkingIds, result.model]));
        setTestedWorkingIds(next);
        localStorage.setItem(OPENROUTER_TESTED_KEY, JSON.stringify(next));
      } else {
        setOpenRouterError(result.error || 'Model test failed.');
      }
    } catch (error) {
      setOpenRouterError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpenRouterTesting(false);
    }
  };

  const refreshModels = async () => {
    try {
      const result = await MykModel.listModels();
      setModels(result.models);
      setModelName(current => {
        if (current !== 'No GGUF model selected' && result.models.some(m => m.name === current)) {
          return current;
        }
        return result.models[0]?.name || 'No GGUF model selected';
      });
    } catch {}
  };

  useEffect(() => { refreshModels(); }, []);

  useEffect(() => {
    if (!downloadingId) return;
    let stopped = false;
    const poll = async () => {
      try {
        const status = await MykModelDownload.getDownloadStatus();
        if (stopped) return;
        setDownloadBytes(status.bytes || 0);
        setDownloadTotal(status.total || 0);
        if (status.error) setDownloadError(status.error);
        if (!status.downloading) {
          setDownloadingId(null);
          if (!status.error && !status.cancelled) await refreshModels();
        }
      } catch (e) {
        if (!stopped) setDownloadError(e instanceof Error ? e.message : String(e));
      }
    };
    poll();
    const timer = window.setInterval(poll, 700);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [downloadingId]);

  const downloadModel = async (model: DownloadableModel) => {
    if (downloadingId) return;
    setDownloadError('');
    setDownloadBytes(0);
    setDownloadTotal(model.sizeBytes);
    setDownloadingId(model.id);
    try {
      await MykModelDownload.downloadModel({name: model.filename, url: model.url, sizeBytes: model.sizeBytes});
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : String(error));
      setDownloadingId(null);
    }
  };

  const cancelModelDownload = async () => {
    await MykModelDownload.cancelDownload().catch(() => {});
  };

  const exportModel = async (model: ModelInfo) => {
    try {
      await MykModel.exportModel({name: model.name});
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (text && !text.toLowerCase().includes('cancel')) alert(text);
    }
  };

  const pickModel = async () => {
    setBusy(true);
    try {
      const model = await MykModel.pickModel();
      setModelName(model.name);
      await refreshModels();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (text && !text.toLowerCase().includes('cancel')) alert(text);
    } finally {
      setBusy(false);
    }
  };

  const newChat = async () => {
    if (busy) await MykAI.stop().catch(() => {});
    setBusy(false);
    setMessages([]);
    setMessage('');
    setTab(tab === 'onlineChat' ? 'onlineChat' : 'localChat');
  };

  const copyMessage = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(current => current === index ? null : current), 1200);
    } catch {
      alert('Copy မလုပ်နိုင်ပါ။');
    }
  };

  const send = async () => {
    const value = message.trim();
    if (!value || busy) return;

    const apiKey = openRouterApiKey.trim();
    if (tab === 'onlineChat' && !apiKey) {
      setMessages(current => [...current, {role: 'assistant', text: '❌ OpenRouter API Key မထည့်ရသေးပါ။ Settings → OpenRouter API သို့သွားပါ။'}]);
      setTab('settings');
      return;
    }

    const selectedModel = openRouterSelectedModel || openRouterModels[0]?.id || '';
    if (tab === 'onlineChat' && !selectedModel) {
      setMessages(current => [...current, {role: 'assistant', text: '❌ Gemini / ChatGPT teacher model မရွေးရသေးပါ။ Settings → OpenRouter API သို့သွားပါ။'}]);
      setTab('settings');
      return;
    }

    const history = messages.slice(-6).map(item => ({
      role: item.role,
      content: item.text.replace(/\n\n⏱️.*$/s, ''),
    }));

    setMessage('');
    setMessages(current => [...current, {role: 'user', text: value}]);
    setBusy(true);

    try {
      let reply = '';
      let elapsedMs = 0;
      if (tab === 'localChat') {
        const learnedContext = loadLearningExamples()
          .filter(item => item.status === 'approved')
          .slice(0, 40)
          .map(item => 'Q: ' + item.question + '\nA: ' + item.idealAnswer)
          .join('\n\n')
          .slice(0, 7000);
        if (modelName === 'No GGUF model selected' || !modelName.toLowerCase().includes('padauk')) {
          throw new Error('Padauk GGUF ကို Models မှာ Active လုပ်ပါ။');
        }
        const result = await MykAI.chat({
          message: value,
          modelName,
          historyJson: JSON.stringify(history),
          contextSize: settings.contextSize,
          threads: settings.threads,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          startupTimeoutSeconds: settings.startupTimeoutSeconds,
          responseTimeoutSeconds: Math.max(20, settings.responseTimeoutSeconds),
          thinkingMode: false,
          learnedContext,
        });
        reply = (result.reply || '').trim();
        elapsedMs = result.totalMs || result.generationMs || 0;
      } else {
        if (!testedWorkingIds.includes(selectedModel)) {
          throw new Error('ဒီ Gemini / ChatGPT model ကို အရင် Test လုပ်ပြီး WORKS ဖြစ်အောင်လုပ်ပါ။');
        }
        const result = await chatWithOpenRouter({
          apiKey,
          model: selectedModel,
          message: value,
          history,
          maxTokens: settings.maxTokens,
          temperature: settings.temperature,
        });
        reply = (result.reply || '').trim();
        elapsedMs = result.elapsedMs;
      }
      if (!reply) throw new Error('AI returned an empty response.');
      setMessages(current => [...current, {role: 'assistant', text: reply + `\n\n⏱️ ${Math.round(elapsedMs / 1000)}s · ${tab === 'localChat' ? 'Padauk' : selectedModel}`}]);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessages(current => [...current, {role: 'assistant', text: '❌ ' + text}]);
    } finally {
      setBusy(false);
    }
  };

  const clearChat = () => {
    if (busy) return;
    setMessages([]);
  };

  const row = (label: string, control: React.ReactNode) => (
    <div style={{padding: '14px 0', borderBottom: '1px solid #263044'}}>
      <div style={{fontWeight: 700, marginBottom: 8}}>{label}</div>
      {control}
    </div>
  );

  return (
    <div style={{minHeight:'100vh',background:'#080b12',color:'#f5f7fb',fontFamily:'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <header style={{height:64,padding:'0 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #1d2330',background:'#080b12',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:38,height:38,borderRadius:12,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#7c5cff,#4f8cff)',fontWeight:900}}>M</div>
          <div><div style={{fontSize:17,fontWeight:800}}>Myk</div><div style={{fontSize:10,color:'#8993a6'}}>Myanmar Offline AI</div></div>
        </div>
        <div style={{display:'flex',gap:7}}>
          {tab !== 'home' && <button onClick={()=>{if(busy) MykAI.stop().catch(()=>{}); setBusy(false); setTab('home');}} aria-label="Back to menu" style={{width:38,height:38,borderRadius:11,border:'1px solid #252c3a',background:'#111620',color:'#b9c2d3'}}>←</button>}
          {(tab === 'localChat' || tab === 'onlineChat') && messages.length > 0 && <button onClick={clearChat} disabled={busy} aria-label="Clear chat" style={{width:38,height:38,borderRadius:11,border:'1px solid #252c3a',background:'#111620',color:'#b9c2d3'}}>⌫</button>}
          {(tab === 'localChat' || tab === 'onlineChat') && <button onClick={newChat} aria-label="New chat" style={{width:38,height:38,borderRadius:11,border:'1px solid #252c3a',background:'#111620',color:'#b9c2d3'}}>＋</button>}
          <button onClick={()=>setTab('home')} aria-label="Menu" style={{width:38,height:38,borderRadius:11,border:'1px solid #252c3a',background:'#111620',color:'#b9c2d3'}}>☰</button>
        </div>
      </header>

      <style>{'@keyframes mykBrainPulse{0%,100%{opacity:.38;transform:scale(.88);filter:brightness(.65)}50%{opacity:1;transform:scale(1.08);filter:brightness(1.45)}}'}</style>
      <main style={{maxWidth:920,margin:'0 auto',minHeight:'calc(100vh - 64px)'}}>
        {tab === 'home' && (
          <section style={{padding:'24px 15px 110px'}}>
            <div style={{textAlign:'center',padding:'28px 8px 22px'}}>
              <div style={{width:72,height:72,borderRadius:23,display:'grid',placeItems:'center',margin:'0 auto',background:'linear-gradient(135deg,#7c5cff,#4f8cff)',fontSize:34,fontWeight:900}}>M</div>
              <div style={{fontSize:28,fontWeight:850,marginTop:14}}>Myk</div>
              <div style={{fontSize:12,color:'#818ca0',marginTop:4}}>Myanmar AI</div>
            </div>

            <div style={{fontSize:10,color:'#707b8e',fontWeight:850,letterSpacing:1.4,margin:'8px 4px'}}>AI</div>
            <div style={{display:'grid',gap:10}}>
              <button onClick={()=>{setMessages([]);setTab('localChat')}} style={{textAlign:'left',padding:18,borderRadius:18,border:'1px solid #302b58',background:'linear-gradient(145deg,#15132b,#10151f)',color:'#fff'}}>
                <div style={{fontSize:19,fontWeight:850}}>🎓 Local AI · Padauk</div>
                <div style={{fontSize:11,color:'#8e98aa',marginTop:6}}>ဖုန်းထဲက GGUF model · Internet မလို</div>
              </button>
              <button onClick={()=>{setMessages([]);setTab('onlineChat')}} style={{textAlign:'left',padding:18,borderRadius:18,border:'1px solid #29364d',background:'linear-gradient(145deg,#111b2b,#10151f)',color:'#fff'}}>
                <div style={{fontSize:19,fontWeight:850}}>👨‍🏫 Online AI · Gemini / GPT</div>
                <div style={{fontSize:11,color:'#8e98aa',marginTop:6}}>OpenRouter · Gemini / ChatGPT models</div>
              </button>
            </div>

            <div style={{fontSize:10,color:'#707b8e',fontWeight:850,letterSpacing:1.4,margin:'22px 4px 8px'}}>LEARNING</div>
            <button onClick={()=>setTab('learn')} style={{width:'100%',textAlign:'left',padding:16,borderRadius:16,border:'1px solid #252d3b',background:'#10151f',color:'#fff'}}>
              <div style={{fontSize:16,fontWeight:800}}>📚 Learn · Teach Padauk</div>
              <div style={{fontSize:11,color:'#8e98aa',marginTop:5}}>Gemini / GPT က ဆရာ၊ Padauk က တပည့်</div>
            </button>

            <div style={{fontSize:10,color:'#707b8e',fontWeight:850,letterSpacing:1.4,margin:'22px 4px 8px'}}>TOOLS</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <button onClick={()=>setTab('models')} style={{padding:15,borderRadius:16,border:'1px solid #252d3b',background:'#10151f',color:'#fff',textAlign:'left'}}>
                <div style={{fontSize:15,fontWeight:800}}>◈ Models</div><div style={{fontSize:10,color:'#8e98aa',marginTop:5}}>GGUF စီမံ</div>
              </button>
              <button onClick={()=>setTab('settings')} style={{padding:15,borderRadius:16,border:'1px solid #252d3b',background:'#10151f',color:'#fff',textAlign:'left'}}>
                <div style={{fontSize:15,fontWeight:800}}>⚙ Settings</div><div style={{fontSize:10,color:'#8e98aa',marginTop:5}}>API / Engine</div>
              </button>
            </div>
          </section>
        )}

        {(tab === 'localChat' || tab === 'onlineChat') && (
          <section style={{padding:'18px 15px 145px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div><div style={{fontSize:18,fontWeight:850}}>{tab === 'localChat' ? '🎓 Local AI · Padauk' : '👨‍🏫 Online AI · Gemini / GPT'}</div>
              <div style={{fontSize:10,color:'#778296',marginTop:3}}>{tab === 'localChat' ? 'Offline GGUF engine' : 'OpenRouter API'}</div></div>
              <button onClick={()=>setTab('home')} style={{padding:'8px 11px',borderRadius:10,border:'1px solid #283243',background:'#111620',color:'#aeb8c8',fontSize:11}}>Menu</button>
            </div>
            {messages.length === 0 ? (
              <div style={{minHeight:'62vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center'}}>
                <div style={{width:68,height:68,borderRadius:22,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#7c5cff,#4f8cff)',fontSize:30,fontWeight:900,boxShadow:'0 14px 40px rgba(92,92,255,.2)'}}>M</div>
                <div style={{fontSize:27,fontWeight:800,marginTop:18}}>မင်္ဂလာပါ 👋</div>
                <div style={{fontSize:14,color:'#8e98aa',lineHeight:1.7,marginTop:7}}>Myk ကို မေးလိုတာ မေးနိုင်ပါတယ်။<br/>{tab === 'localChat' ? 'Padauk က သင်ယူထားတဲ့ knowledge နဲ့ offline ဖြေပါမယ်။' : 'Gemini / ChatGPT teacher model က online ဖြေပါမယ်။'}</div>
                <div style={{marginTop:18,padding:'8px 12px',borderRadius:12,border:'1px solid #202837',background:'#0e131c',fontSize:11,color:'#aeb8ca'}}>
                  <span style={{display:'inline-block',width:7,height:7,borderRadius:99,background:'#35d07f',marginRight:7}}/>
                  {tab === 'localChat' ? (modelName === 'No GGUF model selected' ? 'Padauk model မရွေးရသေးပါ' : modelName) : (openRouterModels.find(m => m.id === openRouterSelectedModel)?.name || 'Gemini / ChatGPT model')}
                </div>
                <div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:8,marginTop:20}}>
                  {['မြန်မာလို မေးမယ်','အကြောင်းအရာ ရှင်းပြပါ','စာရေးပေးပါ'].map(x=><button key={x} onClick={()=>setMessage(x)} style={{padding:'9px 13px',borderRadius:20,border:'1px solid #252d3b',background:'#10151f',color:'#b9c3d4',fontSize:12}}>{x}</button>)}
                </div>
              </div>
            ) : messages.map((item,i)=>item.role==='user' ? (
              <div key={i} style={{display:'flex',justifyContent:'flex-end',margin:'18px 0'}}>
                <div style={{maxWidth:'82%',padding:'12px 15px',borderRadius:'18px 18px 5px 18px',background:'#6d5dfc',lineHeight:1.65,fontSize:14,whiteSpace:'pre-wrap'}}>{item.text}</div>
              </div>
            ) : (
              <div key={i} style={{display:'flex',gap:10,margin:'20px 0'}}>
                <div style={{width:30,height:30,flex:'0 0 30px',borderRadius:10,display:'grid',placeItems:'center',background:'#171d29',border:'1px solid #2a3342',fontWeight:800,fontSize:12}}>M</div>
                <div style={{maxWidth:'84%',color:'#e3e8f0',lineHeight:1.75,fontSize:14,whiteSpace:'pre-wrap'}}>
                  <div>{item.text}</div>
                  <button onClick={()=>copyMessage(item.text,i)} style={{marginTop:7,padding:'4px 8px',borderRadius:8,border:'1px solid #252d3b',background:'#10151f',color:'#7f899b',fontSize:10}}>{copiedIndex===i?'Copied ✓':'Copy'}</button>
                </div>
              </div>
            ))}
            {busy && <div style={{display:'flex',gap:12,margin:'20px 0',alignItems:'center'}}>
              <div style={{width:42,height:42,borderRadius:14,display:'grid',placeItems:'center',background:'radial-gradient(circle,#18244a 0%,#111827 65%,#0d1119 100%)',border:'1px solid #33466f',boxShadow:'0 0 18px rgba(91,91,255,.35)',animation:'mykBrainPulse 1.25s ease-in-out infinite'}}>
                <span style={{fontSize:24,filter:'drop-shadow(0 0 6px rgba(111,140,255,.9))'}}>🧠</span>
              </div>
              <div style={{color:'#8e98aa',fontSize:14}}>စဉ်းစားနေပါတယ်…</div>
            </div>}
          </section>
        )}

        {tab === 'learn' && (
          <LearningLab
            modelName={modelName}
            modelsCount={models.length}
            settings={settings}
            openRouterApiKey={openRouterApiKey}
            teacherModel={openRouterSelectedModel}
            teacherModelName={openRouterModels.find(m => m.id === openRouterSelectedModel)?.name || openRouterSelectedModel}
            teacherReady={testedWorkingIds.includes(openRouterSelectedModel)}
            onOpenRouterKeyNeeded={() => setTab('settings')}
          />
        )}

        {tab === 'models' && (
          <section style={{margin:'22px 15px 110px',padding:18,borderRadius:20,background:'#10151f',border:'1px solid #202837'}}>
            <div style={{fontSize:24,fontWeight:800}}>Models</div>
            <div style={{color:'#8993a6',fontSize:13,marginTop:6}}>ဖုန်းထဲက GGUF model တွေကို စီမံပါ။</div>
            <div style={{marginTop:16,padding:16,borderRadius:16,background:'#0c1119',border:'1px solid #202837'}}>
              <div style={{fontSize:10,color:'#7f899b'}}>ACTIVE MODEL</div>
              <div style={{fontSize:14,fontWeight:700,marginTop:7,wordBreak:'break-word'}}>{modelName}</div>
              <div style={{fontSize:11,color:'#7f899b',marginTop:6}}>{models.length} local model{models.length===1?'':'s'}</div>
            </div>
            {models.map(model=><button key={model.name} onClick={()=>setModelName(model.name)} style={{display:'block',width:'100%',textAlign:'left',marginTop:10,padding:14,borderRadius:15,background:'#0c1119',border:model.name===modelName?'1px solid #6658e8':'1px solid #202837',color:'#f5f7fb'}}><div style={{fontSize:13,fontWeight:650,wordBreak:'break-word'}}>{model.name}</div><div style={{fontSize:11,color:'#7f899b',marginTop:5}}>{(model.size/1024/1024).toFixed(1)} MB {model.name===modelName?'· Active · Tap to select':''}</div></button>)}
            <div style={{marginTop:20,fontSize:16,fontWeight:800}}>Recommended downloads</div>
            <div style={{fontSize:12,color:'#7f899b',marginTop:5,lineHeight:1.5}}>App ထဲကနေ တိုက်ရိုက် download လုပ်ပြီး GGUF model ကို အလိုအလျောက်ထည့်နိုင်ပါတယ်။</div>
            {MODEL_CATALOG.map(model=>{
              const installed=models.some(x=>x.name===model.filename);
              const active=installed && modelName===model.filename;
              const downloading=downloadingId===model.id;
              const pct=downloadTotal>0 ? Math.min(100, Math.round(downloadBytes/downloadTotal*100)) : 0;
              return <div key={model.id} style={{marginTop:10,padding:14,borderRadius:15,background:'#0c1119',border:active?'1px solid #6658e8':'1px solid #202837'}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'flex-start'}}><div><div style={{fontSize:13,fontWeight:700}}>{model.name}</div><div style={{fontSize:11,color:'#7f899b',marginTop:5}}>{formatModelSize(model.sizeBytes)} · {model.description}</div></div>{model.recommended&&<span style={{fontSize:9,padding:'4px 7px',borderRadius:8,background:'#182238',color:'#9daeff'}}>Recommended</span>}</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5,marginTop:9}}>{model.tags.map(tag=><span key={tag} style={{fontSize:9,padding:'4px 7px',borderRadius:7,background:'#151b26',color:'#8f9aad'}}>{tag}</span>)}</div>
                {downloading ? <div style={{marginTop:11}}><div style={{height:6,borderRadius:9,background:'#202837',overflow:'hidden'}}><div style={{height:'100%',width:pct+'%',background:'linear-gradient(90deg,#7c5cff,#4f8cff)'}}/></div><div style={{display:'flex',justifyContent:'space-between',marginTop:7,fontSize:10,color:'#8f9aad'}}><span>{formatModelSize(downloadBytes)} / {formatModelSize(downloadTotal)} · {pct}%</span><button onClick={cancelModelDownload} style={{border:0,background:'transparent',color:'#ff8b8b'}}>Cancel</button></div></div>
                : installed ? <div style={{display:'flex',gap:8,marginTop:11}}>
                  <button onClick={()=>setModelName(model.filename)} style={{flex:1,padding:10,borderRadius:10,border:active?'1px solid #6658e8':'1px solid #30394a',background:active?'#1a1835':'#151b26',color:'#fff',fontWeight:700}}>{active?'✓ Active':'Use this model'}</button>
                  <button onClick={()=>{const local=models.find(x=>x.name===model.filename); if(local) exportModel(local);}} style={{padding:'10px 12px',borderRadius:10,border:'1px solid #30394a',background:'#151b26',color:'#d6dce7',fontWeight:700}}>Export</button>
                </div>
                : <button onClick={()=>downloadModel(model)} disabled={!!downloadingId} style={{marginTop:11,width:'100%',padding:10,border:0,borderRadius:10,background:downloadingId?'#202837':'linear-gradient(135deg,#7c5cff,#4f8cff)',color:'#fff',fontWeight:700}}>↓ Download {formatModelSize(model.sizeBytes)}</button>}
              </div>;
            })}
            {downloadError && <div style={{marginTop:12,padding:11,borderRadius:10,background:'#29161a',border:'1px solid #54242c',color:'#ff9da7',fontSize:11}}>❌ {downloadError}</div>}
            <button onClick={pickModel} disabled={busy || !!downloadingId} style={{marginTop:14,width:'100%',padding:13,border:0,borderRadius:13,background:'#151b26',borderColor:'#30394a',color:'#d6dce7',fontWeight:750}}>{busy?'Opening…':'+ Import GGUF from phone'}</button>
          </section>
        )}

        {tab === 'settings' && (
          <section style={{margin:'22px 15px 110px',padding:18,borderRadius:20,background:'#10151f',border:'1px solid #202837'}}>
            <div style={{fontSize:24,fontWeight:800}}>Settings</div>
            <div style={{marginTop:16,padding:15,borderRadius:16,background:'linear-gradient(145deg,#15142a,#0c1119)',border:'1px solid #2c2a4a'}}>
              <div style={{fontSize:10,color:'#9a92ff',fontWeight:800,letterSpacing:1}}>OPENROUTER · ONLINE AI</div>
              <div style={{fontSize:16,fontWeight:800,marginTop:5}}>OpenRouter API Key</div>
              <div style={{fontSize:11,color:'#7f899b',marginTop:5,lineHeight:1.5}}>Myk Chat က အခု OpenRouter ကိုပဲ အသုံးပြုပါမယ်။ Gemini API ကို မသုံးပါ။</div>
              <input type="password" value={openRouterApiKey} onChange={e=>setOpenRouterApiKey(e.target.value)} placeholder="sk-or-..." autoComplete="off" style={{width:'100%',boxSizing:'border-box',marginTop:11,padding:12,borderRadius:11,border:'1px solid #30384a',background:'#080d15',color:'#fff',outline:0}} />
              <div style={{display:'flex',gap:8,marginTop:9}}>
                <button onClick={saveOpenRouterKey} style={{flex:1,padding:9,borderRadius:10,border:0,background:'#6558e8',color:'#fff',fontWeight:750}}>Save Key</button>
                <button onClick={()=>{setOpenRouterApiKey('');localStorage.removeItem(OPENROUTER_KEY);setOpenRouterModels([]);setOpenRouterSelectedModel('');localStorage.removeItem(OPENROUTER_MODEL_KEY);setOpenRouterResult(null);setOpenRouterError('');}} style={{padding:'9px 12px',borderRadius:10,border:'1px solid #3a3038',background:'#181319',color:'#ff9fa8'}}>Clear</button>
              </div>
              <div style={{fontSize:9,color:'#697386',marginTop:9,lineHeight:1.5}}>Key ကို source code ထဲ မထည့်ထားပါ။ ဒီဖုန်းရဲ့ local storage ထဲမှာပဲ သိမ်းထားပါတယ်။</div>
              <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid #252c3a'}}>
                <div style={{fontSize:12,fontWeight:800}}>OpenRouter Model Test</div>
                <div style={{fontSize:10,color:'#7f899b',marginTop:4,lineHeight:1.5}}>ဒီ Key နဲ့ ရနိုင်တဲ့ text chat models တွေကို OpenRouter ကနေ တိုက်ရိုက်ယူပြီး တစ်ခုချင်း စမ်းနိုင်ပါတယ်။</div>
                <button onClick={discoverOpenRouterModels} disabled={openRouterLoading || !openRouterApiKey.trim()} style={{marginTop:10,width:'100%',padding:10,borderRadius:10,border:'1px solid #3b3860',background:'#17152b',color:'#c9c2ff',fontWeight:750}}>
                  {openRouterLoading ? 'Loading model list…' : '🔎 Check available OpenRouter models'}
                </button>
                {openRouterModels.length>0 && <div style={{marginTop:10}}>
                  <div style={{fontSize:9,color:'#7f899b',marginBottom:5}}>TEXT CHAT MODELS · {openRouterModels.length}</div>
                  <input value={openRouterSearch} onChange={e=>setOpenRouterSearch(e.target.value)} placeholder="Model ရှာပါ… (ဥပမာ qwen, gemini, gpt)" style={{width:'100%',boxSizing:'border-box',padding:10,borderRadius:10,background:'#0c1119',color:'#fff',border:'1px solid #30384a'}} />
                  <select value={openRouterSelectedModel} onChange={e=>{setOpenRouterSelectedModel(e.target.value);localStorage.setItem(OPENROUTER_MODEL_KEY,e.target.value);setOpenRouterResult(null);setOpenRouterError('')}} style={{width:'100%',padding:11,marginTop:7,borderRadius:10,background:'#0c1119',color:'#fff',border:'1px solid #30384a'}}>
                    {openRouterModels.filter(model => !openRouterSearch.trim() || (model.id+' '+model.name).toLowerCase().includes(openRouterSearch.trim().toLowerCase())).slice(0,120).map(model=><option key={model.id} value={model.id}>{model.name} · {model.id}</option>)}
                  </select>
                  <div style={{fontSize:10,color:'#7f899b',marginTop:6,lineHeight:1.5}}>
                    {openRouterModels.find(m=>m.id===openRouterSelectedModel)?.description || 'Model metadata loaded from OpenRouter.'}
                  </div>
                  <button onClick={runOpenRouterTest} disabled={openRouterTesting} style={{marginTop:9,width:'100%',padding:10,borderRadius:10,border:0,background:'linear-gradient(135deg,#6558e8,#4f8cff)',color:'#fff',fontWeight:800}}>
                    {openRouterTesting ? 'Testing model…' : '▶ Test selected model'}
                  </button>
                </div>}
                {openRouterResult && <div style={{marginTop:10,padding:11,borderRadius:10,background:openRouterResult.ok?'#0d2119':'#29161a',border:'1px solid '+(openRouterResult.ok?'#215a40':'#54242c')}}>
                  <div style={{fontSize:11,fontWeight:800,color:openRouterResult.ok?'#7ee2ad':'#ff9da7'}}>{openRouterResult.ok?'✅ WORKS':'❌ FAILED'} · {openRouterResult.elapsedMs} ms</div>
                  {openRouterResult.ok && <div style={{fontSize:12,color:'#d7e5dc',marginTop:7,whiteSpace:'pre-wrap'}}>Response: {openRouterResult.reply}</div>}
                  {!openRouterResult.ok && <div style={{fontSize:11,color:'#ffb0b7',marginTop:7,lineHeight:1.5}}>{openRouterResult.error}</div>}
                </div>}
                {openRouterResult?.ok && <div style={{marginTop:7,fontSize:10,color:'#69db9b'}}>✓ This model is verified WORKS and can be used as Padauk's teacher.</div>}
                {openRouterError && <div style={{marginTop:10,padding:10,borderRadius:10,background:'#29161a',border:'1px solid #54242c',color:'#ff9da7',fontSize:10,lineHeight:1.5}}>❌ {openRouterError}</div>}
              </div>
            </div>
            <p style={{color:'#8993a6',fontSize:13,lineHeight:1.6}}>Gemini / ChatGPT ကို Padauk ရဲ့ ဆရာအဖြစ် သုံးနိုင်ပါတယ်။ Approved lessons တွေကို local Learning Memory ထဲသိမ်းပြီး Padauk chat မှာ reference အဖြစ်ထည့်ပေးပါမယ်။</p>
            {row('Thinking Mode', <button onClick={()=>saveSettings({...settings,thinkingMode:!settings.thinkingMode})} style={{width:'100%',padding:12,borderRadius:12,border:'1px solid #2b3444',background:settings.thinkingMode?'#1a1835':'#0c1119',color:settings.thinkingMode?'#b9a8ff':'#d6dce7',fontWeight:750}}>{settings.thinkingMode?'🧠 ON · concise reasoning summary':'⚡ OFF · fastest answer'}</button>)}
            <div style={{fontSize:11,color:'#7f899b',lineHeight:1.5,marginTop:-4,marginBottom:8}}>ON ဖြစ်ရင် Myk က private chain-of-thought ကို မပြဘဲ မေးခွန်းကို ဘယ်လိုဖြေမလဲဆိုတဲ့ အကျဉ်းချုပ် reasoning ကိုသာ ပြပါမယ်။</div>
            {row('Context Size', <select value={settings.contextSize} onChange={e=>saveSettings({...settings,contextSize:Number(e.target.value)})} style={{width:'100%',padding:12,borderRadius:12,background:'#0c1119',color:'#fff',border:'1px solid #2b3444'}}>{[512,1024,2048,4096].map(v=><option key={v} value={v}>{v}</option>)}</select>)}
            {row('CPU Threads', <select value={settings.threads} onChange={e=>saveSettings({...settings,threads:Number(e.target.value)})} style={{width:'100%',padding:12,borderRadius:12,background:'#0c1119',color:'#fff',border:'1px solid #2b3444'}}>{[1,2,3,4,5,6,7,8].map(v=><option key={v} value={v}>{v}</option>)}</select>)}
            {row('Temperature', <input type="number" min="0" max="1.5" step="0.1" value={settings.temperature} onChange={e=>saveSettings({...settings,temperature:Number(e.target.value)})} style={{width:'100%',boxSizing:'border-box',padding:12,borderRadius:12,background:'#0c1119',color:'#fff',border:'1px solid #2b3444'}} />)}
            {row('Max Tokens', <select value={settings.maxTokens} onChange={e=>saveSettings({...settings,maxTokens:Number(e.target.value)})} style={{width:'100%',padding:12,borderRadius:12,background:'#0c1119',color:'#fff',border:'1px solid #2b3444'}}>{[128,256,512,1024,2048].map(v=><option key={v} value={v}>{v}</option>)}</select>)}
            {row('Startup Timeout', <select value={settings.startupTimeoutSeconds} onChange={e=>saveSettings({...settings,startupTimeoutSeconds:Number(e.target.value)})} style={{width:'100%',padding:12,borderRadius:12,background:'#0c1119',color:'#fff',border:'1px solid #2b3444'}}>{[120,300,600].map(v=><option key={v} value={v}>{v/60} minutes</option>)}</select>)}
             {row('Reply Timeout', <select value={settings.responseTimeoutSeconds} onChange={e=>saveSettings({...settings,responseTimeoutSeconds:Number(e.target.value)})} style={{width:'100%',padding:12,borderRadius:12,background:'#0c1119',color:'#fff',border:'1px solid #2b3444'}}>{[10,15,20,30].map(v=><option key={v} value={v}>{v} seconds</option>)}</select>)}
            <button onClick={resetSettings} style={{marginTop:18,width:'100%',padding:12,borderRadius:12,border:'1px solid #30394a',background:'#151b26',color:'#d6dce7'}}>Reset to Recommended</button>
          </section>
        )}
      </main>

      {(tab === 'localChat' || tab === 'onlineChat') && <div style={{position:'fixed',left:0,right:0,bottom:0,padding:'10px 12px 12px',background:'linear-gradient(transparent,#080b12 25%)',zIndex:8}}>
        <div style={{maxWidth:920,margin:'0 auto',border:'1px solid #303847',background:'#111620',borderRadius:19,display:'flex',alignItems:'flex-end',gap:8,padding:8,boxShadow:'0 -8px 35px rgba(0,0,0,.28)'}}>
          <input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send();}} placeholder="Myk ကို မေးလိုတာ ရိုက်ပါ…" style={{flex:1,minWidth:0,border:0,outline:0,background:'transparent',color:'#f5f7fb',padding:'10px 9px',fontSize:14}} />
          <button onClick={busy ? ()=>MykAI.stop() : send} style={{width:42,height:42,border:0,borderRadius:13,background:busy?'#252c3a':'linear-gradient(135deg,#7c5cff,#4f8cff)',color:'#fff',fontWeight:800,fontSize:18}}>{busy?'■':'↑'}</button>
        </div>
        <div style={{textAlign:'center',fontSize:9,color:'#697386',marginTop:6}}>{tab === 'localChat' ? 'Offline · Padauk Student' : 'Online · Gemini / ChatGPT Teacher'}</div>
      </div>}

      {tab !== 'home' && <button onClick={()=>setTab('home')} style={{position:'fixed',right:14,bottom:92,zIndex:9,padding:'9px 13px',borderRadius:13,border:'1px solid #2a3342',background:'#0c1018',color:'#aeb8c8',fontSize:11}}>☰ Menu</button>}

    </div>
  );
}
