import React, {useState} from 'react';

export default function WebApp() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<string[]>([]);

  const send = () => {
    const value = message.trim();
    if (!value) return;
    setMessages(current => [...current, value]);
    setMessage('');
  };

  return (
    <div style={{minHeight: '100vh', background: '#0b1020', color: '#f8fafc', fontFamily: 'system-ui, sans-serif'}}>
      <header style={{padding: '18px 24px', borderBottom: '1px solid #263044', display: 'flex', justifyContent: 'space-between'}}>
        <strong style={{fontSize: 22}}>Myk</strong>
        <span style={{opacity: .7}}>Myanmar Offline AI · Web Test</span>
      </header>
      <main style={{maxWidth: 900, margin: '0 auto', padding: 24}}>
        <section style={{padding: 24, borderRadius: 16, background: '#121a2b', border: '1px solid #263044', marginBottom: 20}}>
          <h1 style={{marginTop: 0}}>Myk Web App</h1>
          <p style={{opacity: .75}}>Web interface test is running. Local GGUF inference will be connected separately because Android native modules cannot run directly in the browser.</p>
        </section>
        <section style={{minHeight: 360, padding: 20, borderRadius: 16, background: '#0f172a', border: '1px solid #263044'}}>
          {messages.length === 0 ? <p style={{opacity: .55}}>Send a test message below.</p> : messages.map((item, i) => <div key={i} style={{padding: '10px 14px', marginBottom: 10, background: '#1e293b', borderRadius: 12}}>{item}</div>)}
        </section>
        <div style={{display: 'flex', gap: 10, marginTop: 14}}>
          <input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Type a message…" style={{flex: 1, padding: 14, borderRadius: 12, border: '1px solid #334155', background: '#111827', color: '#fff'}} />
          <button onClick={send} style={{padding: '0 22px', border: 0, borderRadius: 12, cursor: 'pointer'}}>Send</button>
        </div>
      </main>
    </div>
  );
}
