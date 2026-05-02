import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rating } from './rating.entity';

const q = (2 * Math.log(10)) / 400;

@Injectable()
export class RatingsService {
  constructor(@InjectRepository(Rating) private repo: Repository<Rating>) {}

  async getOrCreate(userId: string): Promise<Rating> {
    let rating = await this.repo.findOne({ where: { user: { id: userId } } });
    if (!rating) {
      rating = this.repo.create({ user: { id: userId } as any });
      await this.repo.save(rating);
    }
    return rating;
  }

  async updateAfterGame(winnerId: string | null, player1Id: string, player2Id: string): Promise<void> {
    const [r1, r2] = await Promise.all([this.getOrCreate(player1Id), this.getOrCreate(player2Id)]);
    const s1 = winnerId === player1Id ? 1 : winnerId === null ? 0.5 : 0;
    const s2 = 1 - s1;
    const [newR1, newR2] = [this.glicko2(r1, r2, s1), this.glicko2(r2, r1, s2)];
    await this.repo.save([
      { ...r1, ...newR1, gamesPlayed: r1.gamesPlayed + 1, wins: r1.wins + (s1 === 1 ? 1 : 0), losses: r1.losses + (s1 === 0 ? 1 : 0), draws: r1.draws + (s1 === 0.5 ? 1 : 0) },
      { ...r2, ...newR2, gamesPlayed: r2.gamesPlayed + 1, wins: r2.wins + (s2 === 1 ? 1 : 0), losses: r2.losses + (s2 === 0 ? 1 : 0), draws: r2.draws + (s2 === 0.5 ? 1 : 0) },
    ]);
  }

  private glicko2(player: Rating, opponent: Rating, score: number) {
    const g = (rd: number) => 1 / Math.sqrt(1 + (3 * q * q * rd * rd) / (Math.PI * Math.PI));
    const E = (r: number, rj: number, rdj: number) => 1 / (1 + Math.pow(10, (-g(rdj) * (r - rj)) / 400));
    const gOpp = g(opponent.rd);
    const eScore = E(player.rating, opponent.rating, opponent.rd);
    const d2 = 1 / (q * q * gOpp * gOpp * eScore * (1 - eScore));
    const newRating = player.rating + (q / (1 / (player.rd * player.rd) + 1 / d2)) * gOpp * (score - eScore);
    const newRd = Math.sqrt(1 / (1 / (player.rd * player.rd) + 1 / d2));
    return { rating: Math.round(newRating), rd: Math.round(newRd) };
  }

  async getLeaderboard(limit = 50): Promise<Rating[]> {
    return this.repo.find({ relations: ['user'], order: { rating: 'DESC' }, take: limit });
  }
}
