import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan, EntityManager } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Bet, BetStatus, BetResult } from './bet.entity';
import { User } from '../users/user.entity';

export const ESCROW_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MIN_BET = 1;
const MAX_BET = 10000;

@Injectable()
export class BetsService {
  private readonly logger = new Logger(BetsService.name);

  constructor(
    @InjectRepository(Bet) private readonly bets: Repository<Bet>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Escrow `amount` credits from `userId` into a new Bet.
   * Atomic: deducts credits and inserts Bet row in one transaction.
   * Throws BadRequestException if balance is insufficient or amount out of range.
   */
  async escrow(userId: string, amount: number, roomId: string | null = null): Promise<Bet> {
    if (!Number.isInteger(amount) || amount < MIN_BET || amount > MAX_BET) {
      throw new BadRequestException(`Bet amount must be an integer between ${MIN_BET} and ${MAX_BET}`);
    }

    return this.dataSource.transaction(async (mgr) => {
      // Lock the user row for the duration of the tx so concurrent escrows can't double-spend
      const user = await mgr.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('User not found');
      if ((user.credits ?? 0) < amount) {
        throw new BadRequestException(
          `Insufficient credits (have ${user.credits ?? 0}, need ${amount})`,
        );
      }

      user.credits = (user.credits ?? 0) - amount;
      await mgr.save(User, user);

      const bet = mgr.create(Bet, {
        user: { id: userId } as User,
        userId,
        amount,
        status: BetStatus.ESCROWED,
        roomId,
        expiresAt: new Date(Date.now() + ESCROW_TTL_MS),
      });
      const saved = await mgr.save(Bet, bet);
      this.logger.log(`Escrowed ${amount} credits from user ${userId} → bet ${saved.id} (room=${roomId ?? '-'})`);
      return saved;
    });
  }

  /**
   * Bind an existing escrowed bet to a roomId (relay assigns this once a room is known).
   */
  async bindToRoom(betId: string, userId: string, roomId: string): Promise<Bet> {
    const bet = await this.bets.findOne({ where: { id: betId } });
    if (!bet) throw new NotFoundException('Bet not found');
    if (bet.userId !== userId) throw new ForbiddenException('Not your bet');
    if (bet.status !== BetStatus.ESCROWED) {
      throw new ConflictException(`Bet is ${bet.status}, cannot bind to room`);
    }
    if (bet.roomId && bet.roomId !== roomId) {
      throw new ConflictException(`Bet already bound to room ${bet.roomId}`);
    }
    bet.roomId = roomId;
    return this.bets.save(bet);
  }

  /**
   * Settle a pair of bets after both players reported the outcome (or one timed out).
   * `result` is from the perspective of the bet identified by `selfBetId`.
   * Idempotent — calling twice with the same pair returns the already-settled rows.
   *
   * Validates:
   *   - both bets exist & are escrowed (or already settled with matching result → idempotent)
   *   - same amount
   *   - same roomId (if both have it set)
   *   - the two userIds differ
   */
  async settle(selfBetId: string, opponentBetId: string, result: BetResult): Promise<{ self: Bet; opponent: Bet }> {
    if (selfBetId === opponentBetId) {
      throw new BadRequestException('selfBetId and opponentBetId must differ');
    }

    return this.dataSource.transaction(async (mgr) => {
      const [self, opp] = await Promise.all([
        mgr.findOne(Bet, { where: { id: selfBetId }, lock: { mode: 'pessimistic_write' } }),
        mgr.findOne(Bet, { where: { id: opponentBetId }, lock: { mode: 'pessimistic_write' } }),
      ]);

      if (!self || !opp) throw new NotFoundException('Bet pair not found');
      if (self.userId === opp.userId) {
        throw new BadRequestException('Bets belong to the same user');
      }
      if (self.amount !== opp.amount) {
        throw new ConflictException(`Bet amounts differ (self=${self.amount}, opp=${opp.amount})`);
      }
      if (self.roomId && opp.roomId && self.roomId !== opp.roomId) {
        throw new ConflictException(`Bets are in different rooms (${self.roomId} vs ${opp.roomId})`);
      }

      // Idempotency: if already settled, return as-is when results are consistent
      if (self.status === BetStatus.SETTLED && opp.status === BetStatus.SETTLED) {
        if (self.result !== result) {
          throw new ConflictException(`Bet ${self.id} already settled with result=${self.result}`);
        }
        return { self, opponent: opp };
      }
      if (self.status !== BetStatus.ESCROWED || opp.status !== BetStatus.ESCROWED) {
        throw new ConflictException(`Cannot settle: self=${self.status}, opp=${opp.status}`);
      }

      const oppResult: BetResult =
        result === BetResult.WIN ? BetResult.LOSS :
        result === BetResult.LOSS ? BetResult.WIN :
        BetResult.DRAW;

      const amount = self.amount;
      let selfPayout = 0;
      let oppPayout = 0;

      if (result === BetResult.DRAW) {
        // Refund both stakes
        selfPayout = amount;
        oppPayout = amount;
      } else if (result === BetResult.WIN) {
        selfPayout = amount * 2;
        oppPayout = 0;
      } else {
        selfPayout = 0;
        oppPayout = amount * 2;
      }

      // Credit both users (loser gets 0, but we still update settledAt)
      const now = new Date();
      if (selfPayout > 0) {
        await mgr.increment(User, { id: self.userId }, 'credits', selfPayout);
      }
      if (oppPayout > 0) {
        await mgr.increment(User, { id: opp.userId }, 'credits', oppPayout);
      }

      self.status = BetStatus.SETTLED;
      self.result = result;
      self.opponentBetId = opp.id;
      self.payout = selfPayout;
      self.settledAt = now;

      opp.status = BetStatus.SETTLED;
      opp.result = oppResult;
      opp.opponentBetId = self.id;
      opp.payout = oppPayout;
      opp.settledAt = now;

      await mgr.save(Bet, [self, opp]);
      this.logger.log(
        `Settled pair ${self.id} (${result}, +${selfPayout}) ↔ ${opp.id} (${oppResult}, +${oppPayout}), amount=${amount}`,
      );

      return { self, opponent: opp };
    });
  }

  /**
   * Freeze a bet pair pending admin review (e.g. both players claimed win).
   * Credits remain deducted; admin must use refund() or admin-resolve to release.
   */
  async freeze(betIdA: string, betIdB: string, reason: string): Promise<void> {
    await this.dataSource.transaction(async (mgr) => {
      const [a, b] = await Promise.all([
        mgr.findOne(Bet, { where: { id: betIdA }, lock: { mode: 'pessimistic_write' } }),
        mgr.findOne(Bet, { where: { id: betIdB }, lock: { mode: 'pessimistic_write' } }),
      ]);
      if (!a || !b) throw new NotFoundException('Bet pair not found');
      if (a.status !== BetStatus.ESCROWED || b.status !== BetStatus.ESCROWED) {
        throw new ConflictException('Cannot freeze: not both escrowed');
      }
      a.status = BetStatus.FROZEN;
      b.status = BetStatus.FROZEN;
      a.opponentBetId = b.id;
      b.opponentBetId = a.id;
      await mgr.save(Bet, [a, b]);
      this.logger.warn(`Froze bet pair ${a.id} / ${b.id}: ${reason}`);
    });
  }

  /**
   * Refund a single escrowed bet (returns credits to the user).
   * Allowed when:
   *   - the room never matched a second player (bet has no opponent yet), OR
   *   - the bet is FROZEN and admin is releasing it (callerIsAdmin=true), OR
   *   - it's auto-expiry from cron (callerIsAdmin=true)
   *
   * userId is the requestor's id; pass null for system/cron callers (along with callerIsAdmin=true).
   */
  async refund(
    betId: string,
    userId: string | null,
    opts: { callerIsAdmin?: boolean; finalStatus?: BetStatus.REFUNDED | BetStatus.EXPIRED } = {},
  ): Promise<Bet> {
    const callerIsAdmin = !!opts.callerIsAdmin;
    const finalStatus = opts.finalStatus ?? BetStatus.REFUNDED;

    return this.dataSource.transaction(async (mgr) => {
      const bet = await mgr.findOne(Bet, {
        where: { id: betId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!bet) throw new NotFoundException('Bet not found');
      if (!callerIsAdmin && bet.userId !== userId) {
        throw new ForbiddenException('Not your bet');
      }
      if (bet.status === BetStatus.REFUNDED || bet.status === BetStatus.EXPIRED) {
        return bet; // idempotent
      }
      if (bet.status === BetStatus.SETTLED) {
        throw new ConflictException('Bet already settled — cannot refund');
      }
      if (bet.status === BetStatus.FROZEN && !callerIsAdmin) {
        throw new ForbiddenException('Bet is frozen — admin only');
      }
      if (bet.status === BetStatus.ESCROWED && !callerIsAdmin) {
        // User-initiated refund only when bet has no opponent yet
        if (bet.opponentBetId) {
          throw new ConflictException('Bet has an opponent — cannot self-refund');
        }
      }

      await mgr.increment(User, { id: bet.userId }, 'credits', bet.amount);
      bet.status = finalStatus;
      bet.payout = bet.amount;
      bet.settledAt = new Date();
      await mgr.save(Bet, bet);
      this.logger.log(`Refunded bet ${bet.id} (${bet.amount} credits → user ${bet.userId}, status=${finalStatus})`);
      return bet;
    });
  }

  async findOne(betId: string, requesterId: string): Promise<Bet> {
    const bet = await this.bets.findOne({ where: { id: betId } });
    if (!bet) throw new NotFoundException('Bet not found');
    if (bet.userId !== requesterId) {
      throw new ForbiddenException('Not your bet');
    }
    return bet;
  }

  async listMine(userId: string, limit = 50): Promise<Bet[]> {
    return this.bets.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }

  /**
   * Cron / on-demand: expire and refund any escrowed bets past their TTL with no opponent.
   * Returns the number of bets refunded.
   */
  async expireStale(): Promise<number> {
    const stale = await this.bets.find({
      where: {
        status: BetStatus.ESCROWED,
        expiresAt: LessThan(new Date()),
      },
      take: 100,
    });
    let count = 0;
    for (const bet of stale) {
      // Skip those that have an opponent — those go through settle/freeze instead
      if (bet.opponentBetId) continue;
      try {
        await this.refund(bet.id, null, { callerIsAdmin: true, finalStatus: BetStatus.EXPIRED });
        count++;
      } catch (err) {
        this.logger.error(`Failed to expire bet ${bet.id}: ${err.message}`);
      }
    }
    if (count > 0) this.logger.log(`Expired ${count} stale bets`);
    return count;
  }

  /**
   * Cron safety net: every 5 minutes, sweep any bets the relay forgot about
   * (e.g. survived a server restart, fell through a cleanup edge case).
   * The relay normally tears down its own waiting bet rooms via per-room timers,
   * so this should rarely refund anything in steady state.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cronExpireStale(): Promise<void> {
    try { await this.expireStale(); }
    catch (e) { this.logger.error(`Cron expireStale failed: ${e.message}`); }
  }
}
