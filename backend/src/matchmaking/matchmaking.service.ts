import { Injectable } from '@nestjs/common';
import { GamesService } from '../games/games.service';
import { RulesType } from '../games/game.entity';

interface QueueEntry { userId: string; rating: number; rulesType: RulesType; joinedAt: Date; }

@Injectable()
export class MatchmakingService {
  private queue: QueueEntry[] = [];

  constructor(private gamesService: GamesService) {}

  async joinQueue(userId: string, rating: number, rulesType: RulesType = RulesType.RUSSIAN) {
    if (this.queue.find(e => e.userId === userId)) return { status: 'already_queued' };
    this.queue.push({ userId, rating, rulesType, joinedAt: new Date() });
    return this.tryMatch(userId);
  }

  leaveQueue(userId: string) {
    this.queue = this.queue.filter(e => e.userId !== userId);
    return { status: 'left' };
  }

  private async tryMatch(userId: string) {
    const entry = this.queue.find(e => e.userId === userId);
    if (!entry) return { status: 'not_found' };

    const ratingRange = Math.min(150 + Math.floor((Date.now() - entry.joinedAt.getTime()) / 10000) * 50, 500);
    const opponent = this.queue.find(e =>
      e.userId !== userId &&
      e.rulesType === entry.rulesType &&
      Math.abs(e.rating - entry.rating) <= ratingRange
    );

    if (!opponent) return { status: 'waiting', position: this.queue.length };

    this.queue = this.queue.filter(e => e.userId !== userId && e.userId !== opponent.userId);
    const game = await this.gamesService.createGame(entry.userId, opponent.userId, entry.rulesType);
    return { status: 'matched', gameId: game.id };
  }
}
