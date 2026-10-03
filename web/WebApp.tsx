import React, {useState} from 'react';

type Tab = 'chat' | 'models' | 'settings';

export default function WebApp() {
  const [tab, setTab] = useState<Tab>('chat');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [modelName, setModelName] = useState('No GGUF model selected');

  const send = () => {
    const value = message.trim();
    if (!value) return;
    setMessages(current => [...current, value]);
    setMessage('');
  };

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
            </section>
            <section style={{minHeight: 380, padding: 18, borderRadius: 16, background: '#0f172a', border: '1px solid #263044'}}>
              {messages.length === 0
                ? <div style={{opacity: .55, textAlign: 'center', paddingTop: 140}}>Your offline conversation will appear here.</div>
                : messages.map((item, i) => (
                    <div key={i} style={{padding: '11px 14px', marginBottom: 10, background: '#1e293b', borderRadius: 12}}>{item}</div>
                  ))}
            </section>
            <div style={{display: 'flex', gap: 8, marginTop: 12}}>
              <input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="မြန်မာလို မေးခွန်းရေးပါ…" style={{flex: 1, minWidth: 0, padding: 14, borderRadius: 12, border: '1px solid #334155', background: '#111827', color: '#fff'}} />
              <button onClick={send} style={{padding: '0 20px', border: 0, borderRadius: 12, fontWeight: 700}}>Send</button>
            </div>
          </>
        )}

        {tab === 'models' && (
          <section style={{padding: 20, borderRadius: 16, background: '#121a2b', border: '1px solid #263044'}}>
            <h2 style={{marginTop: 0}}>GGUF Models</h2>
            <p style={{opacity: .7}}>Choose a local GGUF model for offline inference.</p>
            <div style={{padding: 16, borderRadius: 12, background: '#0f172a', marginBottom: 12}}>
              <div style={{fontWeight: 700}}>{modelName}</div>
              <div style={{fontSize: 13, opacity: .55, marginTop: 5}}>Native Android model support is being connected next.</div>
            </div>
            <button onClick={() => setModelName('Model picker ready — native bridge pending')}
              style={{padding: '12px 16px', borderRadius: 10, border: '1px solid #475569', background: '#1e293b', color: '#fff'}}>
              Select GGUF Model
            </button>
          </section>
        )}

        {tab === 'settings' && (
          <section style={{padding: 20, borderRadius: 16, background: '#121a2b', border: '1px solid #263044'}}>
            <h2 style={{marginTop: 0}}>Settings</h2>
            <p style={{opacity: .7}}>Myk runs locally. Network access is not required for the model once it is installed.</p>
            <div style={{padding: 14, borderRadius: 10, background: '#0f172a', marginTop: 14}}>
              <div style={{fontWeight: 700}}>Engine</div>
              <div style={{opacity: .6, fontSize: 13, marginTop: 4}}>Capacitor Android + native llama.cpp bridge</div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
