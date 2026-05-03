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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { BetsService, ESCROW_TTL_MS } from '../bets/bets.service';
import { BetResult } from '../bets/bet.entity';
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
  // Bet — per-room amount in credits. 0 = free game (anonymous play allowed).
  // When > 0, both host and guest MUST be authenticated (verified JWT) to participate.
  bet: number;
  hostBetId?: string;        // BetService bet id (set in Phase 3)
  guestBetId?: string;       // BetService bet id (set in Phase 3)
  // Phase 6: per-room expiry timer for waiting bet rooms.
  // Fires after ESCROW_TTL_MS if no guest joined; refunds host & tears the room down.
  // Cleared as soon as a guest joins or the host leaves/disconnects.
  betExpireTimer?: ReturnType<typeof setTimeout>;
  // Anti-spam: each side may offer a draw at most once per turn. Reset on every move.
  drawOfferUsedHost?: boolean;
  drawOfferUsedGuest?: boolean;
  // Spectator mode — read-only viewers attached to this room. Receive game:move,
  // game:sync, game:result, game:timeout broadcasts but cannot send any.
  spectatorSocketIds?: Set<string>;
}

const RECONNECT_GRACE_MS = 30_000;

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/guest' })
export class GuestGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private rooms = new Map<string, GuestRoom>();
  private socketToRoom = new Map<string, string>();
  // Cached verified identity per socket (set lazily by verifyJwt)
  private socketAuth = new Map<string, { userId: string; username: string }>();

  private readonly logger = new Logger(GuestGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly bets: BetsService,
  ) {}

  /**
   * Start a per-room expiry timer for a waiting bet room. After ESCROW_TTL_MS the host's
   * escrow is refunded, the host gets a `room:expired` notice, and the room is removed.
   * Cleared by clearBetExpireTimer() as soon as a guest joins or the host leaves.
   */
  private startBetExpireTimer(room: GuestRoom): void {
    if (!room.bet || room.bet <= 0 || !room.hostBetId) return;
    if (room.betExpireTimer) clearTimeout(room.betExpireTimer);
    room.betExpireTimer = setTimeout(async () => {
      const r = this.rooms.get(room.id);
      // Only fire if the room is still waiting & still owned by the same host bet
      if (!r || r.status !== 'waiting' || r.hostBetId !== room.hostBetId) return;
      this.logger.log(`Bet room ${r.id} expired with no guest — refunding host bet ${r.hostBetId}`);
      try { await this.bets.refund(r.hostBetId, null, { callerIsAdmin: true, finalStatus: 'expired' as any }); }
      catch (e) { this.logger.error(`Expiry refund failed for ${r.hostBetId}: ${e.message}`); }
      // Notify the host (if still connected) and tear the room down
      if (r.hostSocketId) {
        this.server.to(r.hostSocketId).emit('room:expired', {
          roomId: r.id,
          reason: 'no_opponent',
          refundedAmount: r.bet,
        });
        this.socketToRoom.delete(r.hostSocketId);
      }
      r.betExpireTimer = undefined;
      this.rooms.delete(r.id);
      this.broadcastRoomList();
    }, ESCROW_TTL_MS);
  }

  private clearBetExpireTimer(room: GuestRoom | undefined): void {
    if (room?.betExpireTimer) {
      clearTimeout(room.betExpireTimer);
      room.betExpireTimer = undefined;
    }
  }

  /**
   * Settle a bet-room pair after a definitive game outcome (winnerColor known) or refund/freeze
   * depending on what bet ids exist on the room. Best-effort: errors are logged but not surfaced
   * to the client (the relay event flow continues regardless).
   *
   * @param mode 'normal' = settle by winnerColor; 'host-wins' = guest left/disconnected/lost;
   *             'guest-wins' = host left/disconnected/lost; 'cancel' = refund both unmatched bets.
   */
  private async settleRoomBets(
    room: GuestRoom,
    mode: 'normal' | 'host-wins' | 'guest-wins' | 'draw' | 'cancel',
    winnerColor?: 'white' | 'black',
  ): Promise<void> {
    if (!room || !room.bet || room.bet <= 0) return;
    const { hostBetId, guestBetId } = room;

    // Cancel mode (or only one side has a bet): refund whatever exists
    if (mode === 'cancel' || !hostBetId || !guestBetId) {
      if (hostBetId) {
        try { await this.bets.refund(hostBetId, null, { callerIsAdmin: true }); }
        catch (e) { this.logger.error(`Refund host bet ${hostBetId} failed: ${e.message}`); }
      }
      if (guestBetId) {
        try { await this.bets.refund(guestBetId, null, { callerIsAdmin: true }); }
        catch (e) { this.logger.error(`Refund guest bet ${guestBetId} failed: ${e.message}`); }
      }
      return;
    }

    // Settle mode: derive host's result, settle pair
    let hostResult: BetResult;
    if (mode === 'draw') hostResult = BetResult.DRAW;
    else if (mode === 'host-wins') hostResult = BetResult.WIN;
    else if (mode === 'guest-wins') hostResult = BetResult.LOSS;
    else hostResult = winnerColor === 'white' ? BetResult.WIN : winnerColor === 'black' ? BetResult.LOSS : BetResult.DRAW;

    try {
      await this.bets.settle(hostBetId, guestBetId, hostResult);
    } catch (e) {
      this.logger.error(`Settle pair ${hostBetId}/${guestBetId} as ${hostResult} failed: ${e.message}`);
      // On settle failure (e.g. already settled inconsistently), freeze for admin review
      try { await this.bets.freeze(hostBetId, guestBetId, `settle failed: ${e.message}`); }
      catch (e2) { this.logger.error(`Freeze fallback failed: ${e2.message}`); }
    }
  }

  /**
   * Try to extract & verify a JWT from the socket handshake.
   *   Client sends:  io(url, { auth: { token: '<jwt>' } })
   * Returns null if no token, invalid token, or expired.
   * Caches the result on the socket for the connection lifetime so we don't re-verify per event.
   */
  private verifyJwt(client: Socket): { userId: string; username: string } | null {
    const cached = this.socketAuth.get(client.id);
    if (cached) return cached;
    const raw = (client.handshake?.auth as any)?.token;
    if (!raw || typeof raw !== 'string') return null;
    try {
      const payload: any = this.jwtService.verify(raw);
      if (!payload?.sub) return null;
      const out = { userId: payload.sub, username: payload.username };
      this.socketAuth.set(client.id, out);
      return out;
    } catch {
      return null;
    }
  }

  handleConnection(_client: Socket) {}

  handleDisconnect(client: Socket) {
    this.socketAuth.delete(client.id);
    // Clean up spectator membership in any room (spectators aren't in socketToRoom)
    for (const r of this.rooms.values()) {
      if (r.spectatorSocketIds && r.spectatorSocketIds.delete(client.id)) {
        // socket left a spectated room — no broadcast needed (count not exposed yet)
      }
    }
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.socketToRoom.delete(client.id);

    // Host disconnects from a still-waiting bet room → refund their escrow and discard the room
    // (no opponent ever joined, no game ever happened).
    if (room.status === 'waiting' && room.hostSocketId === client.id && room.bet > 0) {
      this.clearBotTimer(room);
      this.clearBetExpireTimer(room);
      this.settleRoomBets(room, 'cancel').catch(() => {});
      this.rooms.delete(roomId);
      this.broadcastRoomList();
      return;
    }

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
      room.reconnectTimer = setTimeout(async () => {
        const r2 = this.rooms.get(roomId);
        if (!r2 || r2.status !== 'reconnecting') return;
        if (r2.hostDisconnected && r2.guestSocketId) {
          // Host failed to reconnect → guest wins the pot
          if (r2.bet > 0) await this.settleRoomBets(r2, 'guest-wins');
          this.server.to(r2.guestSocketId).emit('room:opponent-left-win', {
            opponentId: r2.hostUserId,
            rules: r2.rules,
            roomId,
          });
          this.socketToRoom.delete(r2.guestSocketId);
        } else if (r2.guestDisconnected && r2.hostSocketId) {
          // Guest failed to reconnect → host wins the pot
          if (r2.bet > 0) await this.settleRoomBets(r2, 'host-wins');
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
        const tpayload = { loserColor: 'black' as const, reason: 'nomoves' };
        this.server.to(r.hostSocketId).emit('game:timeout', tpayload);
        this.emitSpectators(r, 'game:timeout', tpayload);
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

      const movePayload = {
        fr: move.from.row,
        fc: move.from.col,
        tr: move.to.row,
        tc: move.to.col,
        capCell: move.captures[0] ? [move.captures[0].row, move.captures[0].col] as [number, number] : null,
      };
      this.server.to(r.hostSocketId).emit('game:move', movePayload);
      this.emitSpectators(r, 'game:move', movePayload);

      // Check if game over after bot's move
      const { over, winner } = isGameOver(r.botBoardState);
      if (over) {
        const loserColor = winner === 'black' ? 'white' : 'black';
        const rPayload = { winnerId: null, loserId: null, rules: r.rules, roomId };
        this.server.to(r.hostSocketId).emit('game:result', rPayload);
        this.emitSpectators(r, 'game:result', rPayload);
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
        bet: r.bet || 0,
      }));
  }

  private broadcastRoomList() {
    this.server.emit('room:list', this.getPublicRooms());
  }

  @SubscribeMessage('room:list')
  handleList(@ConnectedSocket() client: Socket) {
    client.emit('room:list', this.getPublicRooms());
  }

  // ── Spectator mode ─────────────────────────────────────────────────────────

  /** Returns true if this socket is a spectator in any room. Used to reject writes. */
  private isSpectator(client: Socket, room: GuestRoom): boolean {
    return !!room.spectatorSocketIds && room.spectatorSocketIds.has(client.id);
  }

  /** Emit an event to every spectator socket attached to this room. */
  private emitSpectators(room: GuestRoom, event: string, payload: any) {
    if (!room.spectatorSocketIds) return;
    for (const sid of room.spectatorSocketIds) {
      this.server.to(sid).emit(event, payload);
    }
  }

  @SubscribeMessage('room:spectate')
  handleSpectate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const room = this.rooms.get(data?.roomId);
    if (!room) { client.emit('room:spectate-error', { code: 'not_found' }); return; }
    if (room.status === 'finished') { client.emit('room:spectate-error', { code: 'finished' }); return; }
    // Block participants from spectating their own room
    if (client.id === room.hostSocketId || client.id === room.guestSocketId) {
      client.emit('room:spectate-error', { code: 'is_player' }); return;
    }
    if (!room.spectatorSocketIds) room.spectatorSocketIds = new Set();
    room.spectatorSocketIds.add(client.id);
    client.join(`room:${data.roomId}`);
    client.emit('room:spectated', {
      roomId:        room.id,
      hostName:      room.hostName,
      guestName:     room.guestName,
      rules:         room.rules,
      turnTime:      room.turnTime,
      currentTurn:   room.currentTurn,
      status:        room.status,
      bet:           room.bet || 0,
    });
    // Ask the host to push a board snapshot for this spectator.
    if (room.hostSocketId) {
      this.server.to(room.hostSocketId).emit('room:request-sync', { forSocketId: client.id });
    }
  }

  @SubscribeMessage('room:unspectate')
  handleUnspectate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string } | string,
  ) {
    const roomId = typeof data === 'string' ? data : data?.roomId;
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.spectatorSocketIds) room.spectatorSocketIds.delete(client.id);
    client.leave(`room:${roomId}`);
  }

  @SubscribeMessage('room:create')
  async handleCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { name: string; rules: string; code?: string; turnTime?: number; userId?: string; allowBot?: boolean; bet?: number },
  ) {
    // Bet rooms require an authenticated socket. Free rooms still allow anon play.
    const bet = Math.max(0, Math.floor(Number(data?.bet) || 0));
    const auth = this.verifyJwt(client);
    if (bet > 0 && !auth) {
      client.emit('room:error', { msg: 'Login required to create a bet game', code: 'auth_required_bet' });
      return;
    }

    // Tear down any existing room owned by this socket. If it was a bet room with an escrowed
    // host bet (and no guest yet), refund the host before discarding.
    const existingId = this.socketToRoom.get(client.id);
    if (existingId) {
      const existing = this.rooms.get(existingId);
      if (existing && existing.hostSocketId === client.id) {
        if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer);
        this.clearBetExpireTimer(existing);
        if (existing.guestSocketId) {
          this.server.to(existing.guestSocketId).emit('room:host-left');
          this.socketToRoom.delete(existing.guestSocketId);
        }
        // Refund any orphaned host bet (no guest matched)
        if (existing.bet > 0 && existing.hostBetId && !existing.guestBetId) {
          try { await this.bets.refund(existing.hostBetId, null, { callerIsAdmin: true }); }
          catch (e) { this.logger.error(`Refund on supersede failed: ${e.message}`); }
        }
        this.rooms.delete(existingId);
      }
      this.socketToRoom.delete(client.id);
    }

    const id = this.gen6();
    const validRules = ['russian', 'english', 'international'];
    const validTimers = [30, 60];
    // For bet rooms, the verified userId from JWT supersedes any client-supplied userId (which is untrusted).
    const hostUserId = bet > 0 ? auth!.userId : (data.userId || undefined);

    // For bet rooms: escrow the host's stake BEFORE the room becomes visible. If it fails
    // (insufficient credits, validation), the room is never created and the client gets an error.
    let hostBetId: string | undefined;
    if (bet > 0) {
      try {
        const escrowed = await this.bets.escrow(auth!.userId, bet, id);
        hostBetId = escrowed.id;
      } catch (e) {
        client.emit('room:error', { msg: e.message || 'Failed to escrow bet', code: 'escrow_failed' });
        return;
      }
    }

    const room: GuestRoom = {
      id,
      hostName: (data.name || 'Guest').substring(0, 20),
      hostSocketId: client.id,
      hostUserId,
      code: data.code?.trim() ? data.code.trim().substring(0, 20) : undefined,
      rules: validRules.includes(data.rules) ? data.rules : 'russian',
      turnTime: validTimers.includes(data.turnTime) ? data.turnTime : undefined,
      status: 'waiting',
      createdAt: Date.now(),
      bet,
      hostBetId,
      spectatorSocketIds: new Set<string>(),
    };

    this.rooms.set(id, room);
    this.socketToRoom.set(client.id, id);
    client.join(`room:${id}`);

    client.emit('room:created', { roomId: id, color: 'white', bet, hostBetId, expiresInMs: bet > 0 ? ESCROW_TTL_MS : undefined });
    this.broadcastRoomList();

    // Bot games are free-only — never auto-join a bot when there's a real bet at stake.
    if (data.allowBot !== false && bet === 0) {
      this.startBotTimer(room, id);
    }
    // Start the relay-owned expiry timer for waiting bet rooms.
    if (bet > 0) this.startBetExpireTimer(room);
  }

  @SubscribeMessage('room:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; name: string; code?: string; userId?: string },
  ) {
    const room = this.rooms.get(data.roomId);

    if (!room) { client.emit('room:error', { msg: 'Room not found' }); return; }
    if (room.status !== 'waiting') { client.emit('room:error', { msg: 'Room is full' }); return; }
    if (room.hostSocketId === client.id) { client.emit('room:error', { msg: 'Cannot join your own room' }); return; }
    if (room.code && room.code !== data.code?.trim()) { client.emit('room:error', { msg: 'Wrong code' }); return; }

    // Bet rooms require an authenticated socket.
    let auth: { userId: string; username: string } | null = null;
    if (room.bet > 0) {
      auth = this.verifyJwt(client);
      if (!auth) {
        client.emit('room:error', { msg: 'Login required to join a bet game', code: 'auth_required_bet' });
        return;
      }
      if (auth.userId === room.hostUserId) {
        client.emit('room:error', { msg: 'Cannot join your own bet game from another tab' });
        return;
      }
    }

    // For bet rooms: escrow the guest's stake BEFORE seating them. If it fails, the host's
    // bet stays in escrow and the room remains 'waiting' for someone with enough credits.
    let guestBetId: string | undefined;
    if (room.bet > 0) {
      try {
        const escrowed = await this.bets.escrow(auth!.userId, room.bet, data.roomId);
        guestBetId = escrowed.id;
      } catch (e) {
        client.emit('room:error', { msg: e.message || 'Failed to escrow bet', code: 'escrow_failed' });
        return;
      }
      // Re-validate room state after the async escrow: another guest may have grabbed it.
      const r2 = this.rooms.get(data.roomId);
      if (!r2 || r2.status !== 'waiting') {
        // Lost the race — refund this guest's escrow and report the room is full
        try { await this.bets.refund(guestBetId, null, { callerIsAdmin: true }); }
        catch (e) { this.logger.error(`Race-loss refund failed: ${e.message}`); }
        client.emit('room:error', { msg: 'Room is no longer available', code: 'room_taken' });
        return;
      }
    }

    const existingId = this.socketToRoom.get(client.id);
    if (existingId && existingId !== data.roomId) this.socketToRoom.delete(client.id);

    this.clearBotTimer(room); // real player joined — cancel bot
    this.clearBetExpireTimer(room); // a guest joined — cancel the unmatched-bet expiry

    room.guestName = (data.name || 'Guest').substring(0, 20);
    room.guestSocketId = client.id;
    // For bet rooms, use verified JWT userId. For free rooms, accept client-supplied userId (still untrusted, used only for display).
    room.guestUserId = room.bet > 0 ? auth!.userId : (data.userId || undefined);
    if (guestBetId) room.guestBetId = guestBetId;
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
      bet: room.bet,
      guestBetId,
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

    // For bet rooms, the rejoiner must be the same authenticated user that originally claimed the slot.
    // This prevents an attacker from hijacking a disconnected player's seat to claim the pot.
    let rejoinAuth: { userId: string; username: string } | null = null;
    if (room.bet > 0) {
      rejoinAuth = this.verifyJwt(client);
      if (!rejoinAuth) {
        client.emit('room:error', { msg: 'Login required to rejoin a bet game', code: 'auth_required_bet' });
        return;
      }
      const expectedId = room.hostDisconnected ? room.hostUserId : room.guestDisconnected ? room.guestUserId : null;
      if (expectedId && rejoinAuth.userId !== expectedId) {
        client.emit('room:error', { msg: 'Only the original player can rejoin a bet game', code: 'auth_mismatch_bet' });
        return;
      }
    }

    if (room.reconnectTimer) { clearTimeout(room.reconnectTimer); room.reconnectTimer = undefined; }
    room.status = 'playing';

    if (room.hostDisconnected) {
      room.hostSocketId = client.id;
      room.hostName = (data.name || 'Guest').substring(0, 20);
      room.hostUserId = room.bet > 0 ? rejoinAuth!.userId : (data.userId || room.hostUserId);
      room.hostDisconnected = false;
      this.socketToRoom.set(client.id, data.roomId);
      client.join(`room:${data.roomId}`);
      client.emit('room:reconnected', { color: 'white', opponentName: room.guestName, opponentId: room.guestUserId, rules: room.rules, turnTime: room.turnTime });
      if (room.guestSocketId) this.server.to(room.guestSocketId).emit('room:opponent-reconnected', { opponentName: room.hostName });
    } else if (room.guestDisconnected) {
      room.guestSocketId = client.id;
      room.guestName = (data.name || 'Guest').substring(0, 20);
      room.guestUserId = room.bet > 0 ? rejoinAuth!.userId : (data.userId || room.guestUserId);
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
      // Bot game: only host (white) sends moves; spectators are silently rejected.
      if (this.isSpectator(client, room)) {
        client.emit('room:spectate-error', { code: 'spectator_readonly' });
        return;
      }
      if (client.id !== room.hostSocketId) return;

      const whiteMoves = getAvailableMoves(room.botBoardState, 'white');
      const move = whiteMoves.find(
        m => m.from.row === data.fr && m.from.col === data.fc && m.to.row === data.tr && m.to.col === data.tc,
      );
      if (!move) return; // invalid move — ignore

      room.botBoardState = applyMove(room.botBoardState, move);
      this.clearTurnTimer(room);

      // Mirror host's move to spectators (they don't see it via the normal opponent-relay
      // path because the "opponent" is a server-side bot).
      this.emitSpectators(room, 'game:move', {
        fr: data.fr, fc: data.fc, tr: data.tr, tc: data.tc, capCell: data.capCell ?? null,
      });

      // Check if host's move ended the game
      const { over, winner } = isGameOver(room.botBoardState);
      if (over) {
        const rPayload = { winnerId: null, loserId: null, rules: room.rules, roomId: data.roomId };
        this.server.to(room.hostSocketId).emit('game:result', rPayload);
        this.emitSpectators(room, 'game:result', rPayload);
        room.status = 'finished';
        return;
      }

      // Bot's turn — schedule response
      room.currentTurn = 'black';
      this.scheduleBotMove(room, data.roomId);
      return;
    }

    // Block writes from spectators
    if (this.isSpectator(client, room)) {
      client.emit('room:spectate-error', { code: 'spectator_readonly' });
      return;
    }
    // Normal relay: forward move to opponent
    const otherId = room.hostSocketId === client.id ? room.guestSocketId : room.hostSocketId;
    const movePayload = { fr: data.fr, fc: data.fc, tr: data.tr, tc: data.tc, capCell: data.capCell ?? null };
    if (otherId) this.server.to(otherId).emit('game:move', movePayload);
    // Mirror to spectators
    this.emitSpectators(room, 'game:move', movePayload);
    // Flip turn and restart server-side timer
    if (room.status === 'playing') {
      room.currentTurn = room.currentTurn === 'white' ? 'black' : 'white';
      this.startTurnTimer(room, data.roomId);
    }
    // A move = a new turn → both sides may offer draw again next time.
    room.drawOfferUsedHost = false;
    room.drawOfferUsedGuest = false;
  }

  @SubscribeMessage('game:over')
  async handleGameOver(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; winnerColor: 'white' | 'black' },
  ) {
    const room = this.rooms.get(data.roomId);
    if (!room || room.status !== 'playing') return;
    if (this.isSpectator(client, room)) {
      client.emit('room:spectate-error', { code: 'spectator_readonly' });
      return;
    }
    this.clearTurnTimer(room);

    const hostIsWinner = data.winnerColor === 'white'; // host is always white
    const winnerId = hostIsWinner ? room.hostUserId : room.guestUserId;
    const loserId  = hostIsWinner ? room.guestUserId : room.hostUserId;

    const payload = { winnerId, loserId, rules: room.rules, roomId: data.roomId };

    if (room.hostSocketId) this.server.to(room.hostSocketId).emit('game:result', payload);
    if (room.guestSocketId) this.server.to(room.guestSocketId).emit('game:result', payload);
    this.emitSpectators(room, 'game:result', payload);

    // Settle bets if this was a bet game. Clear bet ids so a play-again replay starts fresh
    // (re-escrow on replay is a future enhancement; for now play-again is implicitly a free game).
    if (room.bet > 0 && room.hostBetId && room.guestBetId) {
      const mode = data.winnerColor === 'white' ? 'host-wins' : 'guest-wins';
      await this.settleRoomBets(room, mode);
      room.hostBetId = undefined;
      room.guestBetId = undefined;
      room.bet = 0;
    }
  }

  @SubscribeMessage('game:sync')
  handleSync(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; board: number[][]; turn: number; capturedByWhite: number; capturedByBlack: number; forSocketId?: string },
  ) {
    const room = this.rooms.get(data.roomId);
    if (!room) return;
    if (this.isSpectator(client, room)) {
      client.emit('room:spectate-error', { code: 'spectator_readonly' });
      return;
    }
    const payload = { board: data.board, turn: data.turn, capturedByWhite: data.capturedByWhite, capturedByBlack: data.capturedByBlack };
    // Targeted sync (spectator-requested) — go only to that socket
    if (data.forSocketId) {
      this.server.to(data.forSocketId).emit('game:sync', payload);
      return;
    }
    const otherId = room.hostSocketId === client.id ? room.guestSocketId : room.hostSocketId;
    if (otherId) this.server.to(otherId).emit('game:sync', payload);
    this.emitSpectators(room, 'game:sync', payload);
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
    const isHost = room.hostSocketId === client.id;
    const used = isHost ? room.drawOfferUsedHost : room.drawOfferUsedGuest;
    if (used) {
      // One offer per turn — silently drop the duplicate AND tell the offerer their button
      // should stay disabled. Resets when a move happens (next handleMove call).
      client.emit('game:draw-offer-rejected', { reason: 'already_offered_this_turn' });
      return;
    }
    if (isHost) room.drawOfferUsedHost = true; else room.drawOfferUsedGuest = true;
    const otherId = isHost ? room.guestSocketId : room.hostSocketId;
    if (otherId) this.server.to(otherId).emit('game:draw-offer');
  }

  @SubscribeMessage('game:draw-accept')
  async handleDrawAccept(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const room = this.rooms.get(data.roomId);
    if (!room) return;
    const otherId = room.hostSocketId === client.id ? room.guestSocketId : room.hostSocketId;
    if (otherId) this.server.to(otherId).emit('game:draw-accept');
    // Settle bet pair as draw — both stakes refunded
    if (room.bet > 0 && room.hostBetId && room.guestBetId) {
      await this.settleRoomBets(room, 'draw');
      room.hostBetId = undefined;
      room.guestBetId = undefined;
      room.bet = 0;
    }
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
  async handleLeave(@ConnectedSocket() client: Socket, @MessageBody() roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.reconnectTimer) { clearTimeout(room.reconnectTimer); room.reconnectTimer = undefined; }
    this.clearTurnTimer(room);
    this.clearBotTimer(room);
    this.clearBetExpireTimer(room);
    this.socketToRoom.delete(client.id);
    client.leave(`room:${roomId}`);

    const wasPlaying = room.status === 'playing' || room.status === 'reconnecting';

    if (room.hostSocketId === client.id) {
      if (wasPlaying && room.guestSocketId) {
        // Host left mid-game → guest wins the pot
        if (room.bet > 0) await this.settleRoomBets(room, 'guest-wins');
        this.server.to(room.guestSocketId).emit('room:opponent-left-win', { opponentId: room.hostUserId, rules: room.rules, roomId });
        this.socketToRoom.delete(room.guestSocketId);
      } else if (room.guestSocketId) {
        // Host left while guest was waiting/joining — should not happen, but refund both if any
        if (room.bet > 0) await this.settleRoomBets(room, 'cancel');
        this.server.to(room.guestSocketId).emit('room:host-left');
        this.socketToRoom.delete(room.guestSocketId);
      } else {
        // Host abandoned an empty room → refund their escrow
        if (room.bet > 0) await this.settleRoomBets(room, 'cancel');
      }
      this.rooms.delete(roomId);
    } else if (room.guestSocketId === client.id || room.guestDisconnected) {
      if (wasPlaying) {
        // Guest left mid-game → host wins the pot
        if (room.bet > 0) await this.settleRoomBets(room, 'host-wins');
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
