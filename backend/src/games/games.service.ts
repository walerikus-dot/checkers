import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game, GameStatus, RulesType } from './game.entity';
import { Move } from '../moves/move.entity';
import { RatingsService } from '../ratings/ratings.service';
import { createInitialBoard, getAvailableMoves, applyMove, isGameOver, MoveResult } from './engine/checkers.engine';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(Game) private gameRepo: Repository<Game>,
    @InjectRepository(Move) private moveRepo: Repository<Move>,
    private ratingsService: RatingsService,
  ) {}

  async createGame(player1Id: string, player2Id: string | null, rulesType: RulesType = RulesType.RUSSIAN, isPrivate = false): Promise<Game> {
    const boardState = createInitialBoard(rulesType);
    const game = this.gameRepo.create({
      playerWhite: { id: player1Id } as any,
      playerBlack: player2Id ? { id: player2Id } as any : null,
      rulesType,
      boardSize: boardState.boardSize,
      boardState,
      status: GameStatus.PENDING,
      isPrivate,
      joinCode: isPrivate ? Math.random().toString(36).substring(2, 8).toUpperCase() : null,
    });
    return this.gameRepo.save(game);
  }

  async getGame(id: string): Promise<Game> {
    const game = await this.gameRepo.findOne({ where: { id }, relations: ['playerWhite', 'playerBlack', 'winner', 'moves'] });
    if (!game) throw new NotFoundException('Game not found');
    return game;
  }

  async submitMove(gameId: string, userId: string, from: string, to: string): Promise<{ game: Game; move: Move }> {
    const game = await this.getGame(gameId);
    if (game.status !== GameStatus.ACTIVE) throw new BadRequestException('Game is not active');

    const isWhite = game.playerWhite?.id === userId;
    const isBlack = game.playerBlack?.id === userId;
    if (!isWhite && !isBlack) throw new ForbiddenException('Not a player in this game');
    if ((game.boardState.currentTurn === 'white' && !isWhite) || (game.boardState.currentTurn === 'black' && !isBlack))
      throw new BadRequestException('Not your turn');

    const [fromRow, fromCol] = this.parseCell(from);
    const [toRow, toCol] = this.parseCell(to);
    const legalMoves = getAvailableMoves(game.boardState, game.boardState.currentTurn);
    const move = legalMoves.find(m => m.from.row === fromRow && m.from.col === fromCol && m.to.row === toRow && m.to.col === toCol);
    if (!move) throw new BadRequestException('Invalid move');

    const newState = applyMove(game.boardState, move);
    const { over, winner: winnerColor } = isGameOver(newState);

    const moveCount = game.moves?.length ?? 0;
    const moveRecord = this.moveRepo.create({
      game: { id: gameId } as any,
      user: { id: userId } as any,
      moveNumber: moveCount + 1,
      fromCell: from,
      toCell: to,
      captures: move.captures.map(p => `${p.row},${p.col}`),
      isDamaPromotion: move.promotion,
    });
    await this.moveRepo.save(moveRecord);

    game.boardState = newState;
    if (over) {
      game.status = GameStatus.COMPLETED;
      game.endedAt = new Date();
      if (winnerColor) {
        game.winner = winnerColor === 'white' ? game.playerWhite : game.playerBlack;
      }
      if (game.playerWhite && game.playerBlack) {
        await this.ratingsService.updateAfterGame(game.winner?.id ?? null, game.playerWhite.id, game.playerBlack.id);
      }
    }
    await this.gameRepo.save(game);
    return { game, move: moveRecord };
  }

  async resign(gameId: string, userId: string): Promise<Game> {
    const game = await this.getGame(gameId);
    game.status = GameStatus.COMPLETED;
    game.endedAt = new Date();
    game.winner = game.playerWhite?.id === userId ? game.playerBlack : game.playerWhite;
    await this.gameRepo.save(game);
    if (game.playerWhite && game.playerBlack)
      await this.ratingsService.updateAfterGame(game.winner?.id ?? null, game.playerWhite.id, game.playerBlack.id);
    return game;
  }

  /**
   * Record the outcome of a guest-relay game (no server-side move validation).
   * Uses roomId as a deduplication key so only one INSERT happens per game.
   */
  async recordGuestResult(
    callerId: string,
    opponentId: string,
    result: 'win' | 'loss',
    rulesType: RulesType,
    roomId: string,
  ): Promise<void> {
    // Dedup: joinCode stores the relay roomId
    const existing = await this.gameRepo.findOne({ where: { joinCode: roomId } });
    if (existing) return;

    const winnerId = result === 'win' ? callerId : opponentId;
    const loserId  = result === 'win' ? opponentId : callerId;

    const game = this.gameRepo.create({
      playerWhite: { id: winnerId } as any,
      playerBlack: { id: loserId }  as any,
      winner:      { id: winnerId } as any,
      rulesType,
      boardSize:  rulesType === RulesType.INTERNATIONAL ? 10 : 8,
      status:     GameStatus.COMPLETED,
      isPrivate:  false,
      joinCode:   roomId,
      startedAt:  new Date(),
      endedAt:    new Date(),
      boardState: null,
    });
    await this.gameRepo.save(game);
    await this.ratingsService.updateAfterGame(winnerId, winnerId, loserId);
  }

  async getHistory(userId: string, limit = 20): Promise<Game[]> {
    return this.gameRepo.createQueryBuilder('game')
      .leftJoinAndSelect('game.playerWhite', 'white')
      .leftJoinAndSelect('game.playerBlack', 'black')
      .leftJoinAndSelect('game.winner', 'winner')
      .where('white.id = :userId OR black.id = :userId', { userId })
      .andWhere('game.status = :status', { status: GameStatus.COMPLETED })
      .orderBy('game.endedAt', 'DESC')
      .take(limit)
      .getMany();
  }

  private parseCell(cell: string): [number, number] {
    const col = cell.charCodeAt(0) - 97;
    const row = parseInt(cell[1]) - 1;
    return [row, col];
  }
}
