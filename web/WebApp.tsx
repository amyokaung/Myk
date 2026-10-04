import React, {useEffect, useState} from 'react';
import MykModel, {type ModelInfo} from './native/MykModel';
import {registerPlugin} from '@capacitor/core';

interface EngineSettings {
  contextSize: number;
  threads: number;
  temperature: number;
  maxTokens: number;
  startupTimeoutSeconds: number;
}

const DEFAULT_SETTINGS: EngineSettings = {
  contextSize: 1024,
  threads: 4,
  temperature: 0.7,
  maxTokens: 512,
  startupTimeoutSeconds: 600,
};

interface MykAIPlugin {
  chat(options: {
    message: string;
    modelName: string;
    contextSize?: number;
    threads?: number;
    temperature?: number;
    maxTokens?: number;
    startupTimeoutSeconds?: number;
  }): Promise<{reply: string}>;
  stop(): Promise<void>;
}

const MykAI = registerPlugin<MykAIPlugin>('MykAI');

type Tab = 'chat' | 'models' | 'settings';
const SETTINGS_KEY = 'myk-engine-settings';

export default function WebApp() {
  const [tab, setTab] = useState<Tab>('chat');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{role: 'user' | 'assistant'; text: string}>>([]);
  const [modelName, setModelName] = useState('No GGUF model selected');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [busy, setBusy] = useState(false);
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
      if (result.models.length) setModelName(result.models[0].name);
    } catch {}
  };

  useEffect(() => { refreshModels(); }, []);

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

    setMessage('');
    setMessages(current => [...current, {role: 'user', text: value}]);
    setBusy(true);

    try {
      const result = await MykAI.chat({
        message: value,
        modelName: selected,
        contextSize: settings.contextSize,
        threads: settings.threads,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        startupTimeoutSeconds: settings.startupTimeoutSeconds,
      });
      setMessages(current => [...current, {role: 'assistant', text: result.reply || '(No response)'}]);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessages(current => [...current, {role: 'assistant', text: '❌ ' + text}]);
    } finally {
      setBusy(false);
    }
  };

  const row = (label: string, control: React.ReactNode) => (
    <div style={{padding: '14px 0', borderBottom: '1px solid #263044'}}>
      <div style={{fontWeight: 700, marginBottom: 8}}>{label}</div>
      {control}
    </div>
  );

  return (
    <div style={{minHeight: '100vh', background: '#0b1020', color: '#f8fafc', fontFamily: 'system-ui, sans-serif'}}>
      <header style={{padding: '18px 20px', borderBottom: '1px solid #263044', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <strong style={{fontSize: 24}}>Myk</strong>
        <span style={{opacity: .65, fontSize: 13}}>Myanmar Offline AI</span>
      </header>

      <nav style={{display: 'flex', gap: 8, padding: '12px 20px', borderBottom: '1px solid #263044', background: '#0f172a'}}>
        {(['chat', 'models', 'settings'] as Tab[]).map(item => (
          <button key={item} onClick={() => setTab(item)} style={{
            flex: 1, padding: '11px 8px', borderRadius: 10, border: '1px solid #334155',
            background: tab === item ? '#1e293b' : 'transparent', color: '#f8fafc'
          }}>
            {item === 'chat' ? '💬 Chat' : item === 'models' ? '🧠 Models' : '⚙️ Settings'}
          </button>
        ))}
      </nav>

      <main style={{maxWidth: 900, margin: '0 auto', padding: 20}}>
        {tab === 'chat' && (
          <>
            <section style={{padding: 18, borderRadius: 16, background: '#121a2b', border: '1px solid #263044', marginBottom: 14}}>
              <div style={{fontWeight: 700}}>Local AI</div>
              <div style={{marginTop: 5, opacity: .65, fontSize: 13}}>{modelName}</div>
              <div style={{marginTop: 8, opacity: .5, fontSize: 12}}>
                Context {settings.contextSize} · Threads {settings.threads} · Max {settings.maxTokens}
              </div>
            </section>
            <section style={{minHeight: 380, padding: 18, borderRadius: 16, background: '#0f172a', border: '1px solid #263044'}}>
              {messages.length === 0
                ? <div style={{opacity: .55, textAlign: 'center', paddingTop: 140}}>Your offline conversation will appear here.</div>
                : messages.map((item, i) => (
                    <div key={i} style={{padding: '11px 14px', marginBottom: 10, background: item.role === 'user' ? '#1e293b' : '#172554', borderRadius: 12}}>
                      <div style={{fontSize: 11, opacity: .55, marginBottom: 4}}>{item.role === 'user' ? 'You' : 'Myk'}</div>
                      {item.text}
                    </div>
                  ))}
              {busy && <div style={{opacity: .65, padding: 10}}>Myk is thinking…</div>}
            </section>
            <div style={{display: 'flex', gap: 8, marginTop: 12}}>
              <input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="မြန်မာလို မေးခွန်းရေးပါ…" style={{flex: 1, minWidth: 0, padding: 14, borderRadius: 12, border: '1px solid #334155', background: '#111827', color: '#fff'}} />
              <button onClick={send} disabled={busy} style={{padding: '0 20px', border: 0, borderRadius: 12, fontWeight: 700}}>
                {busy ? '…' : 'Send'}
              </button>
            </div>
          </>
        )}

        {tab === 'models' && (
          <section style={{padding: 20, borderRadius: 16, background: '#121a2b', border: '1px solid #263044'}}>
            <h2 style={{marginTop: 0}}>GGUF Models</h2>
            <p style={{opacity: .7}}>Choose a local GGUF model for offline inference.</p>
            <div style={{padding: 16, borderRadius: 12, background: '#0f172a', marginBottom: 12}}>
              <div style={{fontWeight: 700}}>{modelName}</div>
              <div style={{fontSize: 13, opacity: .55, marginTop: 5}}>{models.length} local GGUF model{models.length === 1 ? '' : 's'} stored on this device.</div>
              {models.map(model => <div key={model.name} style={{marginTop: 8, fontSize: 12, opacity: .7}}>{model.name} · {(model.size / 1024 / 1024).toFixed(1)} MB</div>)}
            </div>
            <button onClick={pickModel} disabled={busy}
              style={{padding: '12px 16px', borderRadius: 10, border: '1px solid #475569', background: '#1e293b', color: '#fff'}}>
              {busy ? 'Opening model picker…' : 'Select GGUF Model'}
            </button>
          </section>
        )}

        {tab === 'settings' && (
          <section style={{padding: 20, borderRadius: 16, background: '#121a2b', border: '1px solid #263044'}}>
            <h2 style={{marginTop: 0}}>AI Engine Settings</h2>
            <p style={{opacity: .7}}>ဒီ setting တွေကို ဖုန်းထဲမှာပဲ သိမ်းထားပြီး APK ပြန် build လုပ်စရာမလိုဘဲ ပြောင်းနိုင်ပါတယ်။</p>
            {row('Context Size', <select value={settings.contextSize} onChange={e => saveSettings({...settings, contextSize: Number(e.target.value)})} style={{width: '100%', padding: 12, borderRadius: 10, background: '#111827', color: '#fff'}}>
              {[512, 1024, 2048, 4096].map(v => <option key={v} value={v}>{v}</option>)}
            </select>)}
            {row('CPU Threads', <select value={settings.threads} onChange={e => saveSettings({...settings, threads: Number(e.target.value)})} style={{width: '100%', padding: 12, borderRadius: 10, background: '#111827', color: '#fff'}}>
              {[1,2,3,4,5,6,7,8].map(v => <option key={v} value={v}>{v}</option>)}
            </select>)}
            {row('Temperature', <input type="number" min="0" max="1.5" step="0.1" value={settings.temperature} onChange={e => saveSettings({...settings, temperature: Number(e.target.value)})} style={{width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10, background: '#111827', color: '#fff', border: '1px solid #334155'}} />)}
            {row('Max Tokens', <select value={settings.maxTokens} onChange={e => saveSettings({...settings, maxTokens: Number(e.target.value)})} style={{width: '100%', padding: 12, borderRadius: 10, background: '#111827', color: '#fff'}}>
              {[128, 256, 512, 1024, 2048].map(v => <option key={v} value={v}>{v}</option>)}
            </select>)}
            {row('Startup Timeout', <select value={settings.startupTimeoutSeconds} onChange={e => saveSettings({...settings, startupTimeoutSeconds: Number(e.target.value)})} style={{width: '100%', padding: 12, borderRadius: 10, background: '#111827', color: '#fff'}}>
              {[120, 300, 600].map(v => <option key={v} value={v}>{v / 60} minutes</option>)}
            </select>)}
            <button onClick={resetSettings} style={{marginTop: 18, padding: '12px 16px', borderRadius: 10, border: '1px solid #475569', background: '#1e293b', color: '#fff'}}>
              Reset to Recommended
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
