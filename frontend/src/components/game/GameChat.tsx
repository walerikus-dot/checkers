'use client';
import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../../types/game';

const QUICK_MESSAGES = ['Good game!', 'Good luck!', 'Well played!', 'Nice move!', 'Thanks!'];

interface Props {
  messages: ChatMessage[];
  onSend: (content: string) => void;
  currentUserId: string;
}

export default function GameChat({ messages, onSend, currentUserId }: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-80 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.senderId === currentUserId ? 'justify-end' : 'justify-start'}`}>
            <span className={`px-3 py-1 rounded-lg text-sm max-w-xs break-words ${msg.senderId === currentUserId ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
              {msg.content}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex flex-wrap gap-1 px-3 pt-2 border-t border-gray-700">
        {QUICK_MESSAGES.map(m => (
          <button key={m} onClick={() => onSend(m)} className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition">
            {m}
          </button>
        ))}
      </div>
      <div className="flex gap-2 p-3">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          className="flex-1 bg-gray-700 text-white px-3 py-2 rounded text-sm border border-gray-600 focus:outline-none focus:border-amber-500"
          maxLength={500}
        />
        <button onClick={handleSend} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded text-sm transition">
          Send
        </button>
      </div>
    </div>
  );
}
