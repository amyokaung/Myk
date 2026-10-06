import React, {useEffect, useState} from 'react';
import MykModel, {type ModelInfo} from './native/MykModel';
import MykAI from './native/MykAI';
import {registerPlugin} from '@capacitor/core';
import {MODEL_CATALOG, formatModelSize, type DownloadableModel} from './modelCatalog';
import LearningLab from './LearningLab';
import {loadLearningExamples} from './learning';

interface EngineSettings {
  contextSize: number;
  threads: number;
  temperature: number;
  maxTokens: number;
  startupTimeoutSeconds: number;
  thinkingMode: boolean;
}

const DEFAULT_SETTINGS: EngineSettings = {
  contextSize: 512,
  threads: 4,
  temperature: 0.5,
  maxTokens: 256,
  startupTimeoutSeconds: 600,
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

type Tab = 'chat' | 'learn' | 'models' | 'settings';
const SETTINGS_KEY = 'myk-engine-settings';
const GEMINI_KEY = 'myk-gemini-api-key';

export default function WebApp() {
  const [tab, setTab] = useState<Tab>('chat');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [modelName, setModelName] = useState('No GGUF model selected');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem(GEMINI_KEY) || '');
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
    setTab('chat');
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

    if (!models.length) {
      alert('အရင်ဆုံး Models ထဲက GGUF model တစ်ခုရွေးပါ။');
      setTab('models');
      return;
    }

    const selected = modelName === 'No GGUF model selected' ? models[0]?.name : modelName;
    if (!selected) return;

    const history = messages.slice(-10);
    const approvedLearning = loadLearningExamples().filter(x => x.status === 'approved').slice(0, 12);
    const learnedContext = approvedLearning.map(x => `Q: ${x.question}\nA: ${x.idealAnswer}`).join('\n\n').slice(0, 3000);
    const historyJson = JSON.stringify(history.map(item => ({
      role: item.role,
      content: item.text,
    })));

    setMessage('');
    setMessages(current => [...current, {role: 'user', text: value}]);
    setBusy(true);

    try {
      const result = await MykAI.chat({
        message: value,
        modelName: selected,
        historyJson,
        contextSize: settings.contextSize,
        threads: settings.threads,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        startupTimeoutSeconds: settings.startupTimeoutSeconds,
        thinkingMode: settings.thinkingMode,
        learnedContext,
      });
      const reply = (result.reply || '').trim();
      if (!reply) throw new Error('AI returned an empty response. Check the selected GGUF model or llama-server log.');
      const thinking = (result.thinkingSummary || '').trim();
      const timing = result.totalMs ? `\n\n⏱️ ${Math.round(result.totalMs / 1000)}s` : '';
      const visibleReply = thinking && settings.thinkingMode
        ? `🧠 စဉ်းစားပုံအကျဉ်း\n${thinking}\n\n💬 အဖြေ\n${reply}${timing}`
        : reply + timing;
      setMessages(current => [...current, {role: 'assistant', text: visibleReply}]);
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
          {messages.length > 0 && <button onClick={clearChat} disabled={busy} aria-label="Clear chat" style={{width:38,height:38,borderRadius:11,border:'1px solid #252c3a',background:'#111620',color:'#b9c2d3'}}>⌫</button>}
          <button onClick={newChat} aria-label="New chat" style={{width:38,height:38,borderRadius:11,border:'1px solid #252c3a',background:'#111620',color:'#b9c2d3'}}>＋</button>
          <button onClick={()=>setTab('settings')} aria-label="Settings" style={{width:38,height:38,borderRadius:11,border:'1px solid #252c3a',background:'#111620',color:'#b9c2d3'}}>⚙</button>
        </div>
      </header>

      <main style={{maxWidth:920,margin:'0 auto',minHeight:'calc(100vh - 64px)'}}>
        {tab === 'chat' && (
          <section style={{padding:'18px 15px 145px'}}>
            {messages.length === 0 ? (
              <div style={{minHeight:'62vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center'}}>
                <div style={{width:68,height:68,borderRadius:22,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#7c5cff,#4f8cff)',fontSize:30,fontWeight:900,boxShadow:'0 14px 40px rgba(92,92,255,.2)'}}>M</div>
                <div style={{fontSize:27,fontWeight:800,marginTop:18}}>မင်္ဂလာပါ 👋</div>
                <div style={{fontSize:14,color:'#8e98aa',lineHeight:1.7,marginTop:7}}>Myk ကို မေးလိုတာ မေးနိုင်ပါတယ်။<br/>အင်တာနက်မလိုဘဲ ဒီဖုန်းထဲမှာပဲ အလုပ်လုပ်ပါတယ်။</div>
                <div style={{marginTop:18,padding:'8px 12px',borderRadius:12,border:'1px solid #202837',background:'#0e131c',fontSize:11,color:'#aeb8ca'}}>
                  <span style={{display:'inline-block',width:7,height:7,borderRadius:99,background:'#35d07f',marginRight:7}}/>
                  {modelName === 'No GGUF model selected' ? 'Model မရွေးရသေးပါ' : modelName}
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
            {busy && <div style={{display:'flex',gap:10,margin:'20px 0'}}><div style={{width:30,height:30,borderRadius:10,display:'grid',placeItems:'center',background:'#171d29',border:'1px solid #2a3342',fontWeight:800,fontSize:12}}>M</div><div style={{color:'#8e98aa',paddingTop:5}}>Myk is thinking ···</div></div>}
          </section>
        )}

        {tab === 'learn' && (
          <LearningLab
            modelName={modelName}
            modelsCount={models.length}
            settings={settings}
            geminiApiKey={geminiApiKey}
            onGeminiKeyNeeded={() => setTab('settings')}
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
              <div style={{fontSize:10,color:'#9a92ff',fontWeight:800,letterSpacing:1}}>LEARNING LAB · GEMINI</div>
              <div style={{fontSize:16,fontWeight:800,marginTop:5}}>Gemini API Key</div>
              <div style={{fontSize:11,color:'#7f899b',marginTop:5,lineHeight:1.5}}>Learning Lab ရဲ့ Teacher / Judge အတွက် သီးသန့်သုံးမယ့် key ပါ။ ပုံမှန် Chat က Gemini ကို မခေါ်ပါ။</div>
              <input type="password" value={geminiApiKey} onChange={e=>{setGeminiApiKey(e.target.value);localStorage.setItem(GEMINI_KEY,e.target.value)}} placeholder="AIza..." autoComplete="off" style={{width:'100%',boxSizing:'border-box',marginTop:11,padding:12,borderRadius:11,border:'1px solid #30384a',background:'#080d15',color:'#fff',outline:0}} />
              <div style={{display:'flex',gap:8,marginTop:9}}>
                <button onClick={()=>{localStorage.setItem(GEMINI_KEY,geminiApiKey.trim());setGeminiApiKey(geminiApiKey.trim());}} style={{flex:1,padding:9,borderRadius:10,border:0,background:'#6558e8',color:'#fff',fontWeight:750}}>Save Key</button>
                <button onClick={()=>{setGeminiApiKey('');localStorage.removeItem(GEMINI_KEY)}} style={{padding:'9px 12px',borderRadius:10,border:'1px solid #3a3038',background:'#181319',color:'#ff9fa8'}}>Clear</button>
              </div>
              <div style={{fontSize:9,color:'#697386',marginTop:9,lineHeight:1.5}}>Key ကို GitHub/source code ထဲ မထည့်ထားပါ။ ဒီဖုန်းရဲ့ local storage ထဲမှာပဲ သိမ်းထားပါတယ်။</div>
            </div>
            <p style={{color:'#8993a6',fontSize:13,lineHeight:1.6}}>AI engine ကို ဒီဖုန်းထဲမှာပဲ ချိန်ညှိနိုင်ပါတယ်။ Model သို့မဟုတ် engine setting ပြောင်းပြီးနောက် နောက်မေးခွန်းမှာ server ကို အလိုအလျောက် restart လုပ်ပေးပါမယ်။</p>
            {row('Thinking Mode', <button onClick={()=>saveSettings({...settings,thinkingMode:!settings.thinkingMode})} style={{width:'100%',padding:12,borderRadius:12,border:'1px solid #2b3444',background:settings.thinkingMode?'#1a1835':'#0c1119',color:settings.thinkingMode?'#b9a8ff':'#d6dce7',fontWeight:750}}>{settings.thinkingMode?'🧠 ON · concise reasoning summary':'⚡ OFF · fastest answer'}</button>)}
            <div style={{fontSize:11,color:'#7f899b',lineHeight:1.5,marginTop:-4,marginBottom:8}}>ON ဖြစ်ရင် Myk က private chain-of-thought ကို မပြဘဲ မေးခွန်းကို ဘယ်လိုဖြေမလဲဆိုတဲ့ အကျဉ်းချုပ် reasoning ကိုသာ ပြပါမယ်။</div>
            {row('Context Size', <select value={settings.contextSize} onChange={e=>saveSettings({...settings,contextSize:Number(e.target.value)})} style={{width:'100%',padding:12,borderRadius:12,background:'#0c1119',color:'#fff',border:'1px solid #2b3444'}}>{[512,1024,2048,4096].map(v=><option key={v} value={v}>{v}</option>)}</select>)}
            {row('CPU Threads', <select value={settings.threads} onChange={e=>saveSettings({...settings,threads:Number(e.target.value)})} style={{width:'100%',padding:12,borderRadius:12,background:'#0c1119',color:'#fff',border:'1px solid #2b3444'}}>{[1,2,3,4,5,6,7,8].map(v=><option key={v} value={v}>{v}</option>)}</select>)}
            {row('Temperature', <input type="number" min="0" max="1.5" step="0.1" value={settings.temperature} onChange={e=>saveSettings({...settings,temperature:Number(e.target.value)})} style={{width:'100%',boxSizing:'border-box',padding:12,borderRadius:12,background:'#0c1119',color:'#fff',border:'1px solid #2b3444'}} />)}
            {row('Max Tokens', <select value={settings.maxTokens} onChange={e=>saveSettings({...settings,maxTokens:Number(e.target.value)})} style={{width:'100%',padding:12,borderRadius:12,background:'#0c1119',color:'#fff',border:'1px solid #2b3444'}}>{[128,256,512,1024,2048].map(v=><option key={v} value={v}>{v}</option>)}</select>)}
            {row('Startup Timeout', <select value={settings.startupTimeoutSeconds} onChange={e=>saveSettings({...settings,startupTimeoutSeconds:Number(e.target.value)})} style={{width:'100%',padding:12,borderRadius:12,background:'#0c1119',color:'#fff',border:'1px solid #2b3444'}}>{[120,300,600].map(v=><option key={v} value={v}>{v/60} minutes</option>)}</select>)}
            <button onClick={resetSettings} style={{marginTop:18,width:'100%',padding:12,borderRadius:12,border:'1px solid #30394a',background:'#151b26',color:'#d6dce7'}}>Reset to Recommended</button>
          </section>
        )}
      </main>

      {tab === 'chat' && <div style={{position:'fixed',left:0,right:0,bottom:0,padding:'10px 12px 12px',background:'linear-gradient(transparent,#080b12 25%)',zIndex:8}}>
        <div style={{maxWidth:920,margin:'0 auto',border:'1px solid #303847',background:'#111620',borderRadius:19,display:'flex',alignItems:'flex-end',gap:8,padding:8,boxShadow:'0 -8px 35px rgba(0,0,0,.28)'}}>
          <input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send();}} placeholder="Myk ကို မေးလိုတာ ရိုက်ပါ…" style={{flex:1,minWidth:0,border:0,outline:0,background:'transparent',color:'#f5f7fb',padding:'10px 9px',fontSize:14}} />
          <button onClick={busy ? ()=>MykAI.stop() : send} style={{width:42,height:42,border:0,borderRadius:13,background:busy?'#252c3a':'linear-gradient(135deg,#7c5cff,#4f8cff)',color:'#fff',fontWeight:800,fontSize:18}}>{busy?'■':'↑'}</button>
        </div>
        <div style={{textAlign:'center',fontSize:9,color:'#697386',marginTop:6}}>Offline · ဒီဖုန်းထဲမှာပဲ အလုပ်လုပ်ပါတယ်</div>
      </div>}

      <nav style={{position:'fixed',bottom:76,left:'50%',transform:'translateX(-50%)',display:'flex',gap:4,padding:6,borderRadius:18,border:'1px solid #202837',background:'#0c1018',zIndex:9,boxShadow:'0 8px 30px rgba(0,0,0,.28)'}}>
        {(['chat','learn','models','settings'] as Tab[]).map(item=><button key={item} onClick={()=>setTab(item)} style={{padding:'8px 12px',border:0,borderRadius:12,background:tab===item?'#1a2030':'transparent',color:tab===item?'#f5f7fb':'#7f899b',fontSize:12}}>{item==='chat'?'⌁ Chat':item==='learn'?'✦ Learn':item==='models'?'◈ Models':'⚙ Settings'}</button>)}
      </nav>
    </div>
  );
}
