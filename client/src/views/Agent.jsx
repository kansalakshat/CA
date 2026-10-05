import { useEffect, useRef, useState } from 'react';
import { ChatsCircle, PaperPlaneRight } from '@phosphor-icons/react';
import { useApp } from '../App.jsx';
import { PageHead } from '../components.jsx';
import { api } from '../lib.js';

export default function Agent() {
  const { S, reload, toast } = useApp();
  const [clientId, setClientId] = useState(S.clients[0]?.id || '');
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const boxRef = useRef(null);
  const client = S.clients.find(c => c.id === Number(clientId));
  const st = S.agentStats;

  useEffect(() => {
    if (!clientId) return;
    api('GET', `/api/messages?clientId=${clientId}`).then(setMessages).catch(e => toast(e.message));
  }, [clientId, toast]);

  useEffect(() => { boxRef.current?.scrollTo(0, boxRef.current.scrollHeight); }, [messages, typing]);

  async function send() {
    const msg = text.trim();
    if (!msg || !clientId) return;
    setText('');
    setMessages(m => [...m, { id: 'tmp', role: 'client', text: msg, created_at: '' }]);
    setTyping(true);
    try {
      await api('POST', '/api/chat', { clientId: Number(clientId), text: msg });
      setMessages(await api('GET', `/api/messages?clientId=${clientId}`));
      reload();   // updates stats, badges and any auto-created task
    } catch (e) {
      toast(e.message);
    }
    setTyping(false);
  }

  const miniStats = [
    [st.autoResolveRate == null ? '-' : `${st.autoResolveRate}%`, 'Auto-resolve rate'],
    [st.avgResponseSec == null ? '-' : `${st.avgResponseSec}s`, 'Average response time'],
    [st.queriesMonth, 'Queries this month'],
    [st.escalatedMonth, 'Escalated to CA'],
  ];

  return (
    <>
      <PageHead title="AI support agent"
        desc="WhatsApp aur email se aane wale client queries ka AI automatically reply karta hai. Jo sawaal AI nahi sambhal pata, woh Tasks mein CA ke liye chala jaata hai." />

      <div className="agent-layout">
        <section className="card chat" aria-label="Live chat">
          <div className="chat-head">
            <div className="info">
              <h2 style={{ fontSize: 15 }}>{client?.name || 'Live chat'}</h2>
              <div className="cell-sub">{client ? `${client.phone} · web chat · ` : ''}{S.settings.n8nBaseUrl ? 'n8n AI replies' : 'Basic auto-reply (n8n off)'}</div>
            </div>
            {S.clients.length > 0 && (
              <select className="input sm" style={{ width: 'auto', maxWidth: 220 }} value={clientId} onChange={e => setClientId(e.target.value)} aria-label="Chat as client">
                {S.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
          <div className="chat-msgs" ref={boxRef} aria-live="polite">
            {!client && <div className="empty"><ChatsCircle size={28} />Add a client to start chatting.</div>}
            {client && !messages.length && !typing && <div className="empty"><ChatsCircle size={28} />No messages yet. Type a client question below.</div>}
            {messages.map((m, i) => (
              <div key={m.id + '-' + i} className={'msg ' + (m.role === 'client' ? 'client' : 'ai')}>
                <div className="msg-bubble">{m.text}</div>
                <div className="msg-meta">
                  {m.role === 'client' ? client?.name : 'AI agent'} · {m.created_at ? m.created_at.slice(11, 16) : 'just now'}
                  {m.role === 'ai' && (m.escalated ? ' · escalated to CA' : ' · auto-replied')}
                </div>
              </div>
            ))}
            {typing && <div className="msg ai"><div className="msg-bubble" aria-label="AI is typing"><div className="typing"><i /><i /><i /></div></div></div>}
          </div>
          <div className="chat-input">
            <textarea className="input" rows="1" placeholder="Client ki taraf se message likhein…" value={text} aria-label="Message" disabled={!client}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="btn btn-primary" onClick={send} disabled={typing || !client || !text.trim()} aria-label="Send"><PaperPlaneRight size={18} weight="fill" /></button>
          </div>
        </section>

        <div className="stack">
          <section className="card mini-stats" aria-label="Agent numbers">
            {miniStats.map(([value, label]) => (
              <div key={label}><div className="v">{value}</div><div className="l">{label}</div></div>
            ))}
          </section>

          <section className="card">
            <div className="card-head"><h2>Top question topics this month</h2></div>
            <div className="card-body">
              {st.topics.map(t => (
                <div className="kv" key={t.topic}>
                  <span>{t.topic}</span>
                  <span className="muted num">{t.count} ask{t.count > 1 ? 's' : ''}</span>
                </div>
              ))}
              {!st.topics.length && <div className="empty">No client questions this month yet.</div>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
