import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  BoardState,
  createInitialBoard,
  getAvailableMoves,
  applyMove,
  isGameOver,
} from '../games/engine/checkers.engine';

type RulesType = 'russian' | 'english' | 'international';

const BOT_FIRST = ['swift','dark','red','iron','silent','wild','sharp','clever','brave','cold','lone','steel','quick','sly','bold'];
const BOT_SECOND = ['pawn','rook','king','wolf','fox','eagle','hawk','bear','tiger','knight','bishop','dragon','shadow','storm','arrow'];
const BOT_WAIT_MS = 5_000; // wait 5s for a real opponent, then bot joins

interface GuestRoom {
  id: string;
  hostName: string;
  hostSocketId: string;
  hostUserId?: string;       // optional — set when host is logged in
  guestName?: string;
  guestSocketId?: string;
  guestUserId?: string;      // optional — set when guest is logged in
  code?: string;
  rules: string;
  turnTime?: number;
  status: 'waiting' | 'playing' | 'reconnecting' | 'finished';
  createdAt: number;
  hostDisconnected?: boolean;
  guestDisconnected?: boolean;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  // Turn timer enforcement
  currentTurn?: 'white' | 'black';
  turnTimer?: ReturnType<typeof setTimeout>;
  // Bot game
  isBotGame?: boolean;
  botBoardState?: BoardState;
  botTimer?: ReturnType<typeof setTimeout>;
}

const RECONNECT_GRACE_MS = 30_000;

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/guest' })
export class GuestGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private rooms = new Map<string, GuestRoom>();
  private socketToRoom = new Map<string, string>();

  handleConnection(_client: Socket) {}

  handleDisconnect(client: Socket) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.socketToRoom.delete(client.id);

    if (room.status === 'playing') {
      this.clearTurnTimer(room); // pause timer during reconnect grace
      this.clearBotTimer(room);
      const isHost = room.hostSocketId === client.id;
      if (isHost) {
        room.hostDisconnected = true;
        if (room.guestSocketId)
          this.server.to(room.guestSocketId).emit('room:opponent-reconnecting', { timeout: RECONNECT_GRACE_MS / 1000 });
      } else {
        room.guestDisconnected = true;
        this.server.to(room.hostSocketId).emit('room:opponent-reconnecting', { timeout: RECONNECT_GRACE_MS / 1000 });
      }

      room.status = 'reconnecting';
      if (room.reconnectTimer) clearTimeout(room.reconnectTimer);
      room.reconnectTimer = setTimeout(() => {
        const r2 = this.rooms.get(roomId);
        if (!r2 || r2.status !== 'reconnecting') return;
        if (r2.hostDisconnected && r2.guestSocketId) {
          this.server.to(r2.guestSocketId).emit('room:opponent-left-win', {
            opponentId: r2.hostUserId,
            rules: r2.rules,
            roomId,
          });
          this.socketToRoom.delete(r2.guestSocketId);
        } else if (r2.guestDisconnected && r2.hostSocketId) {
          this.server.to(r2.hostSocketId).emit('room:opponent-left-win', {
            opponentId: r2.guestUserId,
            rules: r2.rules,
            roomId,
          });
          this.socketToRoom.delete(r2.hostSocketId);
        }
        this.rooms.delete(roomId);
        this.broadcastRoomList();
      }, RECONNECT_GRACE_MS);

      this.broadcastRoomList();
      return;
    }

    if (room.hostSocketId === client.id) {
      this.clearBotTimer(room);
      if (room.guestSocketId) {
        this.server.to(room.guestSocketId).emit('room:host-left');
        this.socketToRoom.delete(room.guestSocketId);
      }
      this.rooms.delete(roomId);
    } else if (room.guestSocketId === client.id) {
      room.guestName = undefined;
      room.guestSocketId = undefined;
      room.guestUserId = undefined;
      room.status = 'waiting';
      this.server.to(room.hostSocketId).emit('room:guest-left');
    }

    this.broadcastRoomList();
  }

  private gen6(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private clearTurnTimer(room: GuestRoom): void {
    if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = undefined; }
  }

  private randomBotName(): string {
    const first  = BOT_FIRST[Math.floor(Math.random() * BOT_FIRST.length)];
    const second = BOT_SECOND[Math.floor(Math.random() * BOT_SECOND.length)];
    const num    = Math.floor(Math.random() * 90) + 10; // 10–99
    return `${first}_${second}${num}`;
  }

  private startBotTimer(room: GuestRoom, roomId: string): void {
    if (room.botTimer) clearTimeout(room.botTimer);
    room.botTimer = setTimeout(() => {
      const r = this.rooms.get(roomId);
      if (!r || r.status !== 'waiting') return;

      const botName = this.randomBotName();
      r.guestName = botName;
      r.status = 'playing';
      r.currentTurn = 'white';
      r.isBotGame = true;

      const rules = ['russian', 'english', 'international'].includes(r.rules)
        ? (r.rules as RulesType)
        : 'russian';
      r.botBoardState = createInitialBoard(rules);

      this.server.to(r.hostSocketId).emit('room:opponent-joined', {
        opponentName: botName,
        color: 'white',
        rules: r.rules,
        turnTime: r.turnTime,
        isBot: true,
      });

      this.startTurnTimer(r, roomId);
      this.broadcastRoomList();
    }, BOT_WAIT_MS);
  }

  private clearBotTimer(room: GuestRoom): void {
    if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = undefined; }
  }

  private scheduleBotMove(room: GuestRoom, roomId: string): void {
    if (!room.isBotGame || !room.botBoardState) return;

    const delay = 700 + Math.random() * 1300; // 0.7–2s human-like delay
    setTimeout(() => {
      const r = this.rooms.get(roomId);
      if (!r || r.status !== 'playing' || !r.isBotGame || !r.botBoardState) return;

      const botMoves = getAvailableMoves(r.botBoardState, 'black');
      if (botMoves.length === 0) {
        // Bot has no moves → host wins
        this.server.to(r.hostSocketId).emit('game:timeout', { loserColor: 'black', reason: 'nomoves' });
        this.clearTurnTimer(r);
        r.status = 'finished';
        this.rooms.delete(roomId);
        if (r.hostSocketId) this.socketToRoom.delete(r.hostSocketId);
        this.broadcastRoomList();
        return;
      }

      // Pick a random move (keeps bot beatable)
      const move = botMoves[Math.floor(Math.random() * botMoves.length)];
      r.botBoardState = applyMove(r.botBoardState, move);

      this.server.to(r.hostSocketId).emit('game:move', {
        fr: move.from.row,
        fc: move.from.col,
        tr: move.to.row,
        tc: move.to.col,
        capCell: move.captures[0] ? [move.captures[0].row, move.captures[0].col] : null,
      });

      // Check if game over after bot's move
      const { over, winner } = isGameOver(r.botBoardState);
      if (over) {
        const loserColor = winner === 'black' ? 'white' : 'black';
        this.server.to(r.hostSocketId).emit('game:result', { winnerId: null, loserId: null, rules: r.rules, roomId });
        this.clearTurnTimer(r);
        r.status = 'finished';
        return;
      }

      // It's white's (host's) turn again
      r.currentTurn = 'white';
      this.startTurnTimer(r, roomId);
    }, delay);
  }

  private startTurnTimer(room: GuestRoom, roomId: string): void {
    if (!room.turnTime) return;
    this.clearTurnTimer(room);
    room.turnTimer = setTimeout(() => {
      const r = this.rooms.get(roomId);
      if (!r || r.status !== 'playing') return;
      const loserColor = r.currentTurn ?? 'white';
      const payload = { loserColor, reason: 'timeout' };
      if (r.hostSocketId) this.server.to(r.hostSocketId).emit('game:timeout', payload);
      if (r.guestSocketId) this.server.to(r.guestSocketId).emit('game:timeout', payload);
      if (r.hostSocketId) this.socketToRoom.delete(r.hostSocketId);
      if (r.guestSocketId) this.socketToRoom.delete(r.guestSocketId);
      r.status = 'finished';
      this.rooms.delete(roomId);
      this.broadcastRoomList();
    }, room.turnTime * 1000);
  }

  private getPublicRooms() {
    return Array.from(this.rooms.values())
      .filter((r) => r.status !== 'finished')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        id: r.id,
        hostName: r.hostName,
        hostUserId: r.hostUserId,
        guestName: r.guestName,
        rules: r.rules,
        turnTime: r.turnTime,
        locked: !!r.code,
        status: r.status,
        createdAt: r.createdAt,
      }));
  }

  private broadcastRoomList() {
    this.server.emit('room:list', this.getPublicRooms());
  }

  @SubscribeMessage('room:list')
  handleList(@ConnectedSocket() client: Socket) {
    client.emit('room:list', this.getPublicRooms());
  }

  @SubscribeMessage('room:create')
  handleCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { name: string; rules: string; code?: string; turnTime?: number; userId?: string; allowBot?: boolean },
  ) {
    const existingId = this.socketToRoom.get(client.id);
    if (existingId) {
      const existing = this.rooms.get(existingId);
      if (existing && existing.hostSocketId === client.id) {
        if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer);
        if (existing.guestSocketId) {
          this.server.to(existing.guestSocketId).emit('room:host-left');
          this.socketToRoom.delete(existing.guestSocketId);
        }
        this.rooms.delete(existingId);
      }
      this.socketToRoom.delete(client.id);
    }

    const id = this.gen6();
    const validRules = ['russian', 'english', 'international'];
    const validTimers = [30, 60];
    const room: GuestRoom = {
      id,
      hostName: (data.name || 'Guest').substring(0, 20),
      hostSocketId: client.id,
      hostUserId: data.userId || undefined,
      code: data.code?.trim() ? data.code.trim().substring(0, 20) : undefined,
      rules: validRules.includes(data.rules) ? data.rules : 'russian',
      turnTime: validTimers.includes(data.turnTime) ? data.turnTime : undefined,
      status: 'waiting',
      createdAt: Date.now(),
    };

    this.rooms.set(id, room);
    this.socketToRoom.set(client.id, id);
    client.join(`room:${id}`);

    client.emit('room:created', { roomId: id, color: 'white' });
    this.broadcastRoomList();

    // Auto-join bot only when allowBot is not explicitly false (Host rooms send allowBot:false)
    if (data.allowBot !== false) {
      this.startBotTimer(room, id);
    }
  }

  @SubscribeMessage('room:join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; name: string; code?: string; userId?: string },
  ) {
    const room = this.rooms.get(data.roomId);

    if (!room) { client.emit('room:error', { msg: 'Room not found' }); return; }
    if (room.status !== 'waiting') { client.emit('room:error', { msg: 'Room is full' }); return; }
    if (room.hostSocketId === client.id) { client.emit('room:error', { msg: 'Cannot join your own room' }); return; }
    if (room.code && room.code !== data.code?.trim()) { client.emit('room:error', { msg: 'Wrong code' }); return; }

    const existingId = this.socketToRoom.get(client.id);
    if (existingId && existingId !== data.roomId) this.socketToRoom.delete(client.id);

    this.clearBotTimer(room); // real player joined — cancel bot

    room.guestName = (data.name || 'Guest').substring(0, 20);
    room.guestSocketId = client.id;
    room.guestUserId = data.userId || undefined;
    room.status = 'playing';
    room.currentTurn = 'white'; // white (host) always goes first

    this.socketToRoom.set(client.id, data.roomId);
    client.join(`room:${data.roomId}`);

    this.startTurnTimer(room, data.roomId);

    client.emit('room:joined', {
      roomId: data.roomId,
      color: 'black',
      opponentName: room.hostName,
      opponentId: room.hostUserId,
      rules: room.rules,
      turnTime: room.turnTime,
    });
    this.server.to(room.hostSocketId).emit('room:opponent-joined', {
      opponentName: room.guestName,
      opponentId: room.guestUserId,
      color: 'white',
      rules: room.rules,
      turnTime: room.turnTime,
    });

    this.broadcastRoomList();
  }

  @SubscribeMessage('room:rejoin')
  handleRejoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; name: string; userId?: string },
  ) {
    const room = this.rooms.get(data.roomId);
    if (!room || room.status !== 'reconnecting') {
      client.emit('room:error', { msg: 'Room not available for rejoin' });
      return;
    }

    if (room.reconnectTimer) { clearTimeout(room.reconnectTimer); room.reconnectTimer = undefined; }
    room.status = 'playing';

    if (room.hostDisconnected) {
      room.hostSocketId = client.id;
      room.hostName = (data.name || 'Guest').substring(0, 20);
      room.hostUserId = data.userId || room.hostUserId;
      room.hostDisconnected = false;
      this.socketToRoom.set(client.id, data.roomId);
      client.join(`room:${data.roomId}`);
      client.emit('room:reconnected', { color: 'white', opponentName: room.guestName, opponentId: room.guestUserId, rules: room.rules, turnTime: room.turnTime });
      if (room.guestSocketId) this.server.to(room.guestSocketId).emit('room:opponent-reconnected', { opponentName: room.hostName });
    } else if (room.guestDisconnected) {
      room.guestSocketId = client.id;
      room.guestName = (data.name || 'Guest').substring(0, 20);
      room.guestUserId = data.userId || room.guestUserId;
      room.guestDisconnected = false;
      this.socketToRoom.set(client.id, data.roomId);
      client.join(`room:${data.roomId}`);
      client.emit('room:reconnected', { color: 'black', opponentName: room.hostName, opponentId: room.hostUserId, rules: room.rules, turnTime: room.turnTime });
      if (room.hostSocketId) this.server.to(room.hostSocketId).emit('room:opponent-reconnected', { opponentName: room.guestName });
    } else {
      client.emit('room:error', { msg: 'No disconnected slot in this room' });
      return;
    }

    // Restart turn timer for whoever's turn it is now
    this.startTurnTimer(room, data.roomId);
    this.broadcastRoomList();
  }

  @SubscribeMessage('game:move')
  handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; fr: number; fc: number; tr: number; tc: number; capCell: [number, number] | null },
  ) {
    const room = this.rooms.get(data.roomId);
    if (!room) return;

    if (room.isBotGame && room.botBoardState) {
      // Bot game: only host (white) sends moves; apply to board and schedule bot response
      if (client.id !== room.hostSocketId) return;

      const whiteMoves = getAvailableMoves(room.botBoardState, 'white');
      const move = whiteMoves.find(
        m => m.from.row === data.fr && m.from.col === data.fc && m.to.row === data.tr && m.to.col === data.tc,
      );
      if (!move) return; // invalid move — ignore

      room.botBoardState = applyMove(room.botBoardState, move);
      this.clearTurnTimer(room);

      // Check if host's move ended the game
      const { over, winner } = isGameOver(room.botBoardState);
      if (over) {
        this.server.to(room.hostSocketId).emit('game:result', { winnerId: null, loserId: null, rules: room.rules, roomId: data.roomId });
        room.status = 'finished';
        return;
      }

      // Bot's turn — schedule response
      room.currentTurn = 'black';
      this.scheduleBotMove(room, data.roomId);
      return;
    }

    // Normal relay: forward move to opponent
    const otherId = room.hostSocketId === client.id ? room.guestSocketId : room.hostSocketId;
    if (otherId) this.server.to(otherId).emit('game:move', { fr: data.fr, fc: data.fc, tr: data.tr, tc: data.tc, capCell: data.capCell ?? null });
    // Flip turn and restart server-side timer
    if (room.status === 'playing') {
      room.currentTurn = room.currentTurn === 'white' ? 'black' : 'white';
      this.startTurnTimer(room, data.roomId);
    }
  }

  @SubscribeMessage('game:over')
  handleGameOver(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; winnerColor: 'white' | 'black' },
  ) {
    const room = this.rooms.get(data.roomId);
    if (!room || room.status !== 'playing') return;
    this.clearTurnTimer(room);

    const hostIsWinner = data.winnerColor === 'white'; // host is always white
    const winnerId = hostIsWinner ? room.hostUserId : room.guestUserId;
    const loserId  = hostIsWinner ? room.guestUserId : room.hostUserId;

    const payload = { winnerId, loserId, rules: room.rules, roomId: data.roomId };

    if (room.hostSocketId) this.server.to(room.hostSocketId).emit('game:result', payload);
    if (room.guestSocketId) this.server.to(room.guestSocketId).emit('game:result', payload);
  }

  @SubscribeMessage('game:sync')
  handleSync(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; board: number[][]; turn: number; capturedByWhite: number; capturedByBlack: number },
  ) {
    const room = this.rooms.get(data.roomId);
    if (!room) return;
    const otherId = room.hostSocketId === client.id ? room.guestSocketId : room.hostSocketId;
    if (otherId) this.server.to(otherId).emit('game:sync', { board: data.board, turn: data.turn, capturedByWhite: data.capturedByWhite, capturedByBlack: data.capturedByBlack });
  }

  @SubscribeMessage('game:new')
  handleNew(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string; bet?: number; rules?: string; turnTime?: number } | string) {
    const roomId   = typeof data === 'string' ? data : data.roomId;
    const bet      = typeof data === 'string' ? 0    : (data.bet || 0);
    const rules    = typeof data === 'string' ? undefined : data.rules;
    const turnTime = typeof data === 'string' ? undefined : data.turnTime;
    const room = this.rooms.get(roomId);
    if (!room || room.hostSocketId !== client.id) return;
    // Update room settings for the next game
    if (rules) room.rules = rules;
    if (turnTime !== undefined) room.turnTime = turnTime;
    const payload: Record<string, unknown> = { bet };
    if (rules) payload.rules = rules;
    if (turnTime !== undefined) payload.turnTime = turnTime;
    if (room.guestSocketId) this.server.to(room.guestSocketId).emit('game:new', payload);
  }

  // ── Draw offer relay ────────────────────────────────────────────────────

  @SubscribeMessage('game:draw-offer')
  handleDrawOffer(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const room = this.rooms.get(data.roomId);
    if (!room) return;
    const otherId = room.hostSocketId === client.id ? room.guestSocketId : room.hostSocketId;
    if (otherId) this.server.to(otherId).emit('game:draw-offer');
  }

  @SubscribeMessage('game:draw-accept')
  handleDrawAccept(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const room = this.rooms.get(data.roomId);
    if (!room) return;
    const otherId = room.hostSocketId === client.id ? room.guestSocketId : room.hostSocketId;
    if (otherId) this.server.to(otherId).emit('game:draw-accept');
  }

  @SubscribeMessage('game:draw-decline')
  handleDrawDecline(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const room = this.rooms.get(data.roomId);
    if (!room) return;
    const otherId = room.hostSocketId === client.id ? room.guestSocketId : room.hostSocketId;
    if (otherId) this.server.to(otherId).emit('game:draw-decline');
  }

  // ── Chat relay ──────────────────────────────────────────────────────────

  @SubscribeMessage('game:chat')
  handleChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; text: string },
  ) {
    const room = this.rooms.get(data.roomId);
    if (!room) return;
    const text = (data.text || '').slice(0, 200).trim();
    if (!text) return;
    const isHost = room.hostSocketId === client.id;
    const senderName = isHost ? (room.hostName || 'Opponent') : (room.guestName || 'Opponent');
    const otherId = isHost ? room.guestSocketId : room.hostSocketId;
    if (otherId) this.server.to(otherId).emit('game:chat', { text, from: senderName });
  }

  @SubscribeMessage('room:leave')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.reconnectTimer) { clearTimeout(room.reconnectTimer); room.reconnectTimer = undefined; }
    this.clearTurnTimer(room);
    this.clearBotTimer(room);
    this.socketToRoom.delete(client.id);
    client.leave(`room:${roomId}`);

    const wasPlaying = room.status === 'playing' || room.status === 'reconnecting';

    if (room.hostSocketId === client.id) {
      if (wasPlaying && room.guestSocketId) {
        this.server.to(room.guestSocketId).emit('room:opponent-left-win', { opponentId: room.hostUserId, rules: room.rules, roomId });
        this.socketToRoom.delete(room.guestSocketId);
      } else if (room.guestSocketId) {
        this.server.to(room.guestSocketId).emit('room:host-left');
        this.socketToRoom.delete(room.guestSocketId);
      }
      this.rooms.delete(roomId);
    } else if (room.guestSocketId === client.id || room.guestDisconnected) {
      if (wasPlaying) {
        this.server.to(room.hostSocketId).emit('room:opponent-left-win', { opponentId: room.guestUserId, rules: room.rules, roomId });
        this.socketToRoom.delete(room.hostSocketId);
        this.rooms.delete(roomId);
      } else {
        room.guestName = undefined;
        room.guestSocketId = undefined;
        room.guestUserId = undefined;
        room.status = 'waiting';
        this.server.to(room.hostSocketId).emit('room:guest-left');
      }
    }

    this.broadcastRoomList();
  }
}
