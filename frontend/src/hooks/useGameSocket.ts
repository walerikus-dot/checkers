'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../lib/socket';
import { authApi } from '../lib/api';
import { BoardState, ChatMessage } from '../types/game';
import { useAuthStore } from '../store/auth.store';

export function useGameSocket(gameId: string) {
  const { accessToken, setUser } = useAuthStore();
  const [boardState, setBoardState] = useState<BoardState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gameStatus, setGameStatus] = useState<string>('pending');
  const [winner, setWinner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    if (!accessToken || !gameId) return;
    const socket = getSocket(accessToken);
    socketRef.current = socket;

    socket.emit('game:join', gameId);

    socket.on('game:joined', ({ boardState }: any) => setBoardState(boardState));
    socket.on('game:move-validated', ({ boardState, status, winner }: any) => {
      setBoardState(boardState);
      setGameStatus(status);
      if (winner) setWinner(winner);
      if (status === 'completed') {
        authApi.me().then(r => setUser(r.data)).catch(() => {});
      }
    });
    socket.on('game:move-rejected', ({ reason }: any) => setError(reason));
    socket.on('game:game-ended', ({ winner, reason }: any) => {
      setGameStatus('completed');
      setWinner(winner);
      // Refresh auth store so dashboard/profile show updated rating immediately
      authApi.me().then(r => setUser(r.data)).catch(() => {});
    });
    socket.on('chat:message', (msg: ChatMessage) => setMessages(prev => [...prev, msg]));

    return () => {
      socket.off('game:joined');
      socket.off('game:move-validated');
      socket.off('game:move-rejected');
      socket.off('game:game-ended');
      socket.off('chat:message');
    };
  }, [accessToken, gameId]);

  const sendMove = useCallback((from: string, to: string) => {
    setError(null);
    socketRef.current?.emit('game:move', { gameId, from, to });
  }, [gameId]);

  const sendChat = useCallback((content: string) => {
    socketRef.current?.emit('chat:send', { gameId, content });
  }, [gameId]);

  const resign = useCallback(() => {
    socketRef.current?.emit('game:resign', gameId);
  }, [gameId]);

  return { boardState, messages, gameStatus, winner, error, sendMove, sendChat, resign };
}
