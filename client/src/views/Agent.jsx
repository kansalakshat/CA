import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
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
    api('GET', `/api/messages?clientId=${clientId}`).then(setMessages).catch(e => toast('⚠️ ' + e.message));
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
      toast('⚠️ ' + e.message);
    }
    setTyping(false);
  }

  const miniStats = [
    ['var(--teal)', 'var(--teal-light)', '🤖', st.autoResolveRate == null ? '-' : `${st.autoResolveRate}%`, 'Auto-resolve rate'],
    ['var(--emerald)', 'var(--emerald-light)', '⚡', st.avgResponseSec == null ? '-' : `${st.avgResponseSec}s`, 'Avg response time'],
    ['var(--amber)', 'var(--amber-light)', '📬', st.queriesMonth, 'Queries this month'],
    ['var(--violet)', 'var(--violet-light)', '👨‍💼', st.escalatedMonth, 'Escalated to CA'],
  ];

  return (
    <>
      <div className="section-title">🤖 AI Client Support Agent</div>
      <div className="section-desc">
        WhatsApp/Email se aane wale client queries ka AI automatically reply karta hai. Jo sawaal AI nahi sambhal pata, woh Tasks mein CA ke liye chala jaata hai.
      </div>

      <div className="agent-layout">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Live Chat</span>
            <span className="ai-badge">{S.settings.n8nBaseUrl ? '🤖 n8n AI' : '🤖 Basic auto-reply (n8n off)'}</span>
            <select value={clientId} onChange={e => setClientId(e.target.value)} aria-label="Client"
              style={{ marginLeft: 'auto', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}>
              {S.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="chat-container">
            <div className="chat-header">
              <span style={{ fontSize: 20 }}>💬</span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{client?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{client?.phone} • Web chat</div>
              </div>
              <div className="ai-indicator" style={{ marginLeft: 'auto' }}></div>
              <span style={{ fontSize: 11, color: 'var(--emerald)', fontWeight: 600 }}>AI Active</span>
            </div>
            <div className="chat-messages" ref={boxRef}>
              {!client && <div className="empty">Add a client to start chatting.</div>}
              {client && !messages.length && !typing && <div className="empty">No messages yet. Type a client question below.</div>}
              {messages.map((m, i) => (
                <div key={m.id + '-' + i} className={'msg ' + (m.role === 'client' ? 'msg-client' : 'msg-ai')}>
                  <div className="msg-bubble" style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                  <div className="msg-meta">
                    {m.role === 'client' ? client?.name : '🤖 AI Agent'} • {m.created_at ? m.created_at.slice(11, 16) : 'Just now'}
                    {m.role === 'ai' && (m.escalated ? ' • Escalated to CA' : ' • Auto-replied')}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="msg msg-ai">
                  <div className="msg-bubble" style={{ padding: '8px 14px' }}>
                    <div className="typing-indicator"><div className="typing-dot"></div><div className="typing-dot"></div><div className="typing-dot"></div></div>
                  </div>
                </div>
              )}
            </div>
            <div className="chat-input-area">
              <textarea className="chat-input" rows="1" placeholder="Client ki taraf se message likhein…" value={text} aria-label="Message"
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <button className="send-btn" onClick={send} disabled={typing} aria-label="Send">➤</button>
            </div>
          </div>
        </div>

        <div className="agent-stats-col">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {miniStats.map(([color, bg, icon, value, label]) => (
              <div className="mini-stat" key={label}>
                <div className="mini-stat-icon" style={{ background: bg }}>{icon}</div>
                <div className="mini-stat-info">
                  <div className="value" style={{ color }}>{value}</div>
                  <div className="label">{label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header">
              <span>❓</span>
              <span className="card-title">Top Question Topics (this month)</span>
            </div>
            <div className="faq-list">
              {st.topics.map(t => (
                <div className="faq-item" key={t.topic} style={{ cursor: 'default' }}>
                  <span style={{ fontSize: 14 }}>{t.icon}</span>
                  <span className="faq-q">{t.topic}</span>
                  <span className="faq-count">{t.count} ask{t.count > 1 ? 's' : ''}</span>
                </div>
              ))}
              {!st.topics.length && <div className="empty">No client questions this month yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
