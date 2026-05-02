import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { GamesService } from './games.service';
import { UsersService } from '../users/users.service';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/game' })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private socketToUser = new Map<string, string>();

  constructor(
    private jwtService: JwtService,
    private gamesService: GamesService,
    private usersService: UsersService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      const payload = this.jwtService.verify(token);
      this.socketToUser.set(client.id, payload.sub);
      await this.usersService.setOnline(payload.sub, true);
      this.server.emit('status:online', { userId: payload.sub });
      client.emit('authenticated', { userId: payload.sub });
    } catch {
      client.emit('error:unauthorized', 'Invalid token');
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = this.socketToUser.get(client.id);
    if (userId) {
      await this.usersService.setOnline(userId, false);
      this.socketToUser.delete(client.id);
      this.server.emit('status:offline', { userId });
    }
  }

  @SubscribeMessage('game:join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() gameId: string) {
    client.join(`game:${gameId}`);
    const game = await this.gamesService.getGame(gameId);
    client.emit('game:joined', { gameId, boardState: game.boardState });
  }

  @SubscribeMessage('game:move')
  async handleMove(@ConnectedSocket() client: Socket, @MessageBody() data: { gameId: string; from: string; to: string }) {
    const userId = this.socketToUser.get(client.id);
    try {
      const { game, move } = await this.gamesService.submitMove(data.gameId, userId, data.from, data.to);
      this.server.to(`game:${data.gameId}`).emit('game:move-validated', {
        boardState: game.boardState,
        move: { from: move.fromCell, to: move.toCell, captures: move.captures, promotion: move.isDamaPromotion },
        status: game.status,
        winner: game.winner?.id,
      });
      if (game.status === 'completed') {
        this.server.to(`game:${data.gameId}`).emit('game:game-ended', { winner: game.winner?.id, reason: 'no-moves' });
      }
    } catch (err) {
      client.emit('game:move-rejected', { reason: err.message });
    }
  }

  @SubscribeMessage('game:resign')
  async handleResign(@ConnectedSocket() client: Socket, @MessageBody() gameId: string) {
    const userId = this.socketToUser.get(client.id);
    const game = await this.gamesService.resign(gameId, userId);
    this.server.to(`game:${gameId}`).emit('game:game-ended', { winner: game.winner?.id, reason: 'resignation' });
  }

  @SubscribeMessage('chat:send')
  handleChat(@ConnectedSocket() client: Socket, @MessageBody() data: { gameId: string; content: string }) {
    const userId = this.socketToUser.get(client.id);
    this.server.to(`game:${data.gameId}`).emit('chat:message', {
      senderId: userId,
      content: data.content.substring(0, 500),
      timestamp: new Date().toISOString(),
    });
  }
}
