import {
  Injectable, BadRequestException, NotFoundException, ConflictException,
  Logger, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Tournament, TournamentFormat, TournamentStatus } from './tournament.entity';
import { TournamentParticipant } from './tournament-participant.entity';
import { TournamentMatch } from './tournament-match.entity';
import { TournamentSchedule } from './tournament-schedule.entity';

@Injectable()
export class TournamentsService implements OnModuleInit {
  private readonly log = new Logger(TournamentsService.name);

  constructor(
    @InjectRepository(Tournament)            private repo:      Repository<Tournament>,
    @InjectRepository(TournamentParticipant) private partRepo:  Repository<TournamentParticipant>,
    @InjectRepository(TournamentMatch)       private matchRepo: Repository<TournamentMatch>,
    @InjectRepository(TournamentSchedule)    private schedRepo: Repository<TournamentSchedule>,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onModuleInit() {
    // Refresh nextRunAt on boot so the admin panel shows correct times
    this.refreshNextRunTimes().catch(e => this.log.error('refreshNextRunTimes failed', e));
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async create(
    name: string,
    format: TournamentFormat,
    maxPlayers: number,
    rulesType: string,
    createdById?: string,
    startsAt?: Date,
    autoStarted = false,
  ) {
    const t = this.repo.create({
      name,
      format,
      maxPlayers,
      rulesType: rulesType || 'russian',
      autoStarted,
      ...(createdById ? { createdBy: { id: createdById } as any } : {}),
      startsAt,
    });
    return this.repo.save(t);
  }

  async findAll() {
    const tournaments = await this.repo.find({
      relations: ['createdBy', 'participants'],
      order: { startsAt: 'DESC', createdAt: 'DESC' },
    });
    return tournaments.map(t => ({
      ...t,
      participantCount: t.participants?.length ?? 0,
      participants: undefined,
    }));
  }

  async findOne(id: string) {
    const t = await this.repo.findOne({
      where: { id },
      relations: ['createdBy', 'participants', 'participants.user'],
    });
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }

  async cancel(id: string) {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Tournament not found');
    if (t.status === TournamentStatus.COMPLETED)
      throw new BadRequestException('Cannot cancel a completed tournament');
    await this.repo.update(id, { status: TournamentStatus.CANCELLED });
    return { ok: true };
  }

  /**
   * Delete an empty tournament — only allowed when no match has a recorded
   * result (no `winnerId` set on any match). Removes matches, participants,
   * and the tournament row.
   */
  async delete(id: string) {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Tournament not found');

    const playedCount = await this.matchRepo
      .createQueryBuilder('m')
      .where('m.tournamentId = :id', { id })
      .andWhere('m.winnerId IS NOT NULL')
      .getCount();

    if (playedCount > 0) {
      throw new BadRequestException(
        'Cannot delete a tournament with played games. Cancel it instead.',
      );
    }

    await this.matchRepo.delete({ tournamentId: id });
    await this.partRepo.delete({ tournamentId: id });
    await this.repo.delete(id);
    return { ok: true };
  }

  // ── PARTICIPANTS ───────────────────────────────────────────────────────────

  async join(tournamentId: string, userId: string) {
    const t = await this.repo.findOne({ where: { id: tournamentId }, relations: ['participants'] });
    if (!t) throw new NotFoundException('Tournament not found');
    if (t.status !== TournamentStatus.PENDING)
      throw new BadRequestException('Tournament is not open for registration');
    if (t.participants.length >= t.maxPlayers)
      throw new BadRequestException('Tournament is full');

    const existing = await this.partRepo.findOne({ where: { tournamentId, userId } });
    if (existing) throw new ConflictException('Already joined');

    const p = this.partRepo.create({ tournamentId, userId });
    return this.partRepo.save(p);
  }

  async leave(tournamentId: string, userId: string) {
    const t = await this.repo.findOne({ where: { id: tournamentId } });
    if (!t) throw new NotFoundException('Tournament not found');
    if (t.status !== TournamentStatus.PENDING)
      throw new BadRequestException('Cannot leave an active tournament');

    const p = await this.partRepo.findOne({ where: { tournamentId, userId } });
    if (!p) throw new NotFoundException('Not a participant');
    return this.partRepo.remove(p);
  }

  async getParticipants(tournamentId: string) {
    return this.partRepo.find({
      where: { tournamentId },
      relations: ['user'],
      order: { seed: 'ASC' },
    });
  }

  // ── BRACKET — entry point ──────────────────────────────────────────────────

  async start(id: string) {
    const t = await this.repo.findOne({ where: { id }, relations: ['participants'] });
    if (!t) throw new NotFoundException('Tournament not found');
    if (t.status !== TournamentStatus.PENDING)
      throw new BadRequestException('Tournament is not in pending state');
    if (t.participants.length < 2)
      throw new BadRequestException('Need at least 2 participants to start');

    await this.repo.update(id, { status: TournamentStatus.ACTIVE });

    if (t.format === TournamentFormat.ROUND_ROBIN) {
      return this.generateRoundRobinBracket(id);
    }
    if (t.format === TournamentFormat.DOUBLE_ELIM) {
      return this.generateDEBracket(id);
    }
    return this.generateSEBracket(id);
  }

  // ── DOUBLE ELIMINATION ─────────────────────────────────────────────────────
  // Builds Winners + Losers brackets and a single Grand Final.
  // No bracket-reset on GF for v1 — LB winner beating WB winner ends the tournament.

  async generateDEBracket(tournamentId: string) {
    const t = await this.repo.findOne({
      where: { id: tournamentId },
      relations: ['participants'],
    });
    if (!t) throw new NotFoundException('Tournament not found');

    await this.matchRepo.delete({ tournamentId });

    const parts = [...t.participants].sort(() => Math.random() - 0.5);
    parts.forEach((p, i) => { p.seed = i + 1; });
    await this.partRepo.save(parts);

    const size = nextPow2(parts.length);
    const wbRounds = Math.log2(size);
    const lbRounds = (wbRounds - 1) * 2;  // 2 LB rounds per WB round above R1

    // ── Build empty WB grid ──────────────────────────────────────────────────
    const wb: TournamentMatch[][] = [];
    for (let r = 1; r <= wbRounds; r++) {
      const count = size / Math.pow(2, r);
      const round: TournamentMatch[] = [];
      for (let pos = 0; pos < count; pos++) {
        const m = this.matchRepo.create({
          tournamentId, round: r, position: pos,
          status: 'pending', bracket: 'winners',
        });
        round.push(await this.matchRepo.save(m));
      }
      wb.push(round);
    }

    // ── Build empty LB grid ──────────────────────────────────────────────────
    // LB has 2*(wbRounds-1) rounds. Drop-in (odd) and consolidation (even) alternate.
    // For wbRounds=3 (size=8): LB rounds 1..4. Sizes: 2, 2, 1, 1.
    // For wbRounds=4 (size=16): LB rounds 1..6. Sizes: 4, 4, 2, 2, 1, 1.
    // For wbRounds=2 (size=4):  LB rounds 1..2. Sizes: 1, 1.
    const lb: TournamentMatch[][] = [];
    for (let lr = 1; lr <= lbRounds; lr++) {
      const count = lbMatchCount(wbRounds, lr);
      const round: TournamentMatch[] = [];
      for (let pos = 0; pos < count; pos++) {
        const m = this.matchRepo.create({
          tournamentId, round: wbRounds + lr, position: pos,
          status: 'pending', bracket: 'losers',
        });
        round.push(await this.matchRepo.save(m));
      }
      lb.push(round);
    }

    // ── Grand Final ──────────────────────────────────────────────────────────
    const gf = await this.matchRepo.save(this.matchRepo.create({
      tournamentId, round: wbRounds + lbRounds + 1, position: 0,
      status: 'pending', bracket: 'grand',
    }));

    // ── Wire WB winner pointers (same as SE) ─────────────────────────────────
    for (let r = 0; r < wb.length - 1; r++) {
      for (let pos = 0; pos < wb[r].length; pos++) {
        wb[r][pos].nextMatchId = wb[r + 1][Math.floor(pos / 2)].id;
        await this.matchRepo.save(wb[r][pos]);
      }
    }
    // WB final winner → GF player1
    wb[wb.length - 1][0].nextMatchId = gf.id;
    await this.matchRepo.save(wb[wb.length - 1][0]);

    // ── Wire LB winner pointers ──────────────────────────────────────────────
    // Within LB, R(2k-1) = drop-in round (size = wbRk+1 size), R(2k) = consolidation (same size).
    // Drop-in (odd lr) winner → consolidation match at floor(pos/?) — actually for our shape both
    // drop-in and consolidation rounds have the same number of matches in a pair, then halve:
    //
    //   LB R1 (drop-in,    n)  → LB R2 (consolidation, n)  : winner of pos i → match i (slot 2)
    //   LB R2 (consolidation,n) → LB R3 (drop-in,    n/2) : winner of pos i → match floor(i/2)
    //   LB R3 (drop-in,    n/2)→ LB R4 (consolidation,n/2): winner of pos i → match i (slot 2)
    //   LB R4 (consolidation,n/2)→ LB R5 (drop-in,n/4)    : winner of pos i → match floor(i/2)
    //   ...etc.
    for (let lr = 0; lr < lb.length - 1; lr++) {
      const isDropIn = (lr + 1) % 2 === 1;  // odd LB round = drop-in
      const next = lb[lr + 1];
      for (let pos = 0; pos < lb[lr].length; pos++) {
        // Drop-in → consolidation: same index. Consolidation → drop-in: halve index.
        const nextPos = isDropIn ? pos : Math.floor(pos / 2);
        lb[lr][pos].nextMatchId = next[nextPos].id;
        await this.matchRepo.save(lb[lr][pos]);
      }
    }
    // LB final winner → GF player2
    lb[lb.length - 1][0].nextMatchId = gf.id;
    await this.matchRepo.save(lb[lb.length - 1][0]);

    // ── Wire WB → LB loser drops ─────────────────────────────────────────────
    // WB R1 losers → LB R1 (drop-in). pos i → LB R1 match floor(i/2), slot i%2.
    // WB Rk (k≥2) losers → LB R(2(k-1)) (drop-in). pos i → LB R… match i, slot 2 (player2).
    // Simplification: store nextLoserMatchId on the WB match. When the loser is decided,
    // _advanceDELoser fills the first empty slot on the target LB match.
    for (let pos = 0; pos < wb[0].length; pos++) {
      wb[0][pos].nextLoserMatchId = lb[0][Math.floor(pos / 2)].id;
      await this.matchRepo.save(wb[0][pos]);
    }
    for (let k = 1; k < wb.length; k++) {
      const lbDropInIdx = 2 * k - 1;  // 0-based LB round index for drop-in feeding from WB R(k+1)
      // wbRounds=3, k=1 → lbDropInIdx=1 → LB R2. wb[1] (R2) losers go to lb[1] (R2). ✓
      // wbRounds=3, k=2 → lbDropInIdx=3 → LB R4. wb[2] (R3=Final) loser goes to lb[3] (R4). ✓
      // wbRounds=2, k=1 → lbDropInIdx=1 → LB R2. wb[1] (R2=Final) loser goes to lb[1] (R2). ✓
      if (lbDropInIdx >= lb.length) continue;
      for (let pos = 0; pos < wb[k].length; pos++) {
        wb[k][pos].nextLoserMatchId = lb[lbDropInIdx][pos].id;
        await this.matchRepo.save(wb[k][pos]);
      }
    }

    // ── Fill WB R1 with players + handle BYEs ────────────────────────────────
    const r1 = wb[0];
    for (let i = 0; i < r1.length; i++) {
      const p1 = parts[i * 2]     ?? null;
      const p2 = parts[i * 2 + 1] ?? null;
      r1[i].player1Id = p1?.userId ?? null;
      r1[i].player2Id = p2?.userId ?? null;
      if (p1 && !p2) {
        r1[i].status   = 'bye';
        r1[i].winnerId = p1.userId;
        await this.matchRepo.save(r1[i]);
        await this._advanceSEWinner(r1[i]);
        // BYE has no loser — do not advance to LB
      } else if (p1 && p2) {
        r1[i].status = 'ready';
        await this.matchRepo.save(r1[i]);
      }
    }

    return this.getBracket(tournamentId);
  }

  // ── PLAYER-DRIVEN MATCH PLAY ───────────────────────────────────────────────

  /**
   * Called by either player of a `ready` match. Returns metadata + roomId (if assigned).
   * If roomId is null and caller is player1, the client should host a room and POST set-room.
   * If roomId is null and caller is player2, the client polls until player1 sets the room.
   */
  async startRoom(tid: string, mid: string, userId: string) {
    const match = await this.matchRepo.findOne({ where: { id: mid, tournamentId: tid } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.player1Id !== userId && match.player2Id !== userId)
      throw new BadRequestException('You are not a player in this match');
    if (match.status !== 'ready' && match.status !== 'playing')
      throw new BadRequestException('Match is not playable');

    const t = await this.repo.findOne({ where: { id: tid } });
    if (!t) throw new NotFoundException('Tournament not found');

    const opponentId = match.player1Id === userId ? match.player2Id : match.player1Id;
    const opponent   = opponentId
      ? await this.partRepo.findOne({ where: { tournamentId: tid, userId: opponentId }, relations: ['user'] })
      : null;

    // Compute a friendly round label
    const matches = await this.matchRepo.find({ where: { tournamentId: tid } });
    const maxRound = matches.reduce((m, x) => Math.max(m, x.round), 0);
    let roundLabel: string;
    if (t.format === TournamentFormat.ROUND_ROBIN) {
      roundLabel = `Round ${match.round}`;
    } else if (t.format === TournamentFormat.DOUBLE_ELIM) {
      const wbRounds = matches.filter(m => m.bracket === 'winners')
        .reduce((mx, m) => Math.max(mx, m.round), 0);
      const lbRounds = matches.filter(m => m.bracket === 'losers')
        .reduce((mx, m) => Math.max(mx, m.round - wbRounds), 0);
      roundLabel = deRoundLabel(match.bracket, match.round, wbRounds, lbRounds);
    } else {
      roundLabel = seRoundLabel(match.round, maxRound);
    }

    return {
      tournamentName: t.name,
      roundLabel,
      opponent: opponent ? { id: opponent.user.id, username: opponent.user.username } : null,
      isPlayer1: match.player1Id === userId,
      roomId: match.roomId,
      status: match.status,
    };
  }

  /** Player1 calls this after hosting a room to publish the roomId for player2. */
  async setRoom(tid: string, mid: string, userId: string, roomId: string) {
    if (!roomId || !roomId.trim()) throw new BadRequestException('roomId is required');
    const match = await this.matchRepo.findOne({ where: { id: mid, tournamentId: tid } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.player1Id !== userId)
      throw new BadRequestException('Only player1 can set the room');
    if (match.status !== 'ready' && match.status !== 'playing')
      throw new BadRequestException('Match is not playable');

    if (match.roomId && match.roomId !== roomId) {
      throw new ConflictException('Room already set');
    }
    match.roomId = roomId.trim();
    if (!match.gameStartedAt) match.gameStartedAt = new Date();
    if (match.status === 'ready') match.status = 'playing';
    await this.matchRepo.save(match);
    return { ok: true };
  }

  /**
   * Self-report match result (caller must be a player). Body's winnerId must be one of the
   * two match players, or null for a draw. Reuses reportResult under the hood.
   */
  async playerReportResult(tid: string, mid: string, userId: string, winnerId: string | null) {
    const match = await this.matchRepo.findOne({ where: { id: mid, tournamentId: tid } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.player1Id !== userId && match.player2Id !== userId)
      throw new BadRequestException('You are not a player in this match');
    if (winnerId !== null && winnerId !== match.player1Id && winnerId !== match.player2Id)
      throw new BadRequestException('Winner must be one of the two match players, or null for draw');
    return this.reportResult(tid, mid, winnerId);
  }

  // ── DE INTERNALS ────────────────────────────────────────────────────────────

  /** Drop the loser of a WB match into its assigned LB match's first empty slot. */
  private async _advanceDELoser(match: TournamentMatch) {
    if (!match.nextLoserMatchId || !match.winnerId) return;
    const loserId = match.player1Id === match.winnerId ? match.player2Id : match.player1Id;
    if (!loserId) return;
    const next = await this.matchRepo.findOne({ where: { id: match.nextLoserMatchId } });
    if (!next) return;
    if (!next.player1Id) next.player1Id = loserId;
    else if (!next.player2Id) next.player2Id = loserId;
    if (next.player1Id && next.player2Id) next.status = 'ready';
    await this.matchRepo.save(next);
  }

  // ── SINGLE ELIMINATION ─────────────────────────────────────────────────────

  async generateSEBracket(tournamentId: string) {
    const t = await this.repo.findOne({
      where: { id: tournamentId },
      relations: ['participants'],
    });
    if (!t) throw new NotFoundException('Tournament not found');

    await this.matchRepo.delete({ tournamentId });

    const parts = [...t.participants].sort(() => Math.random() - 0.5);
    parts.forEach((p, i) => { p.seed = i + 1; });
    await this.partRepo.save(parts);

    const size   = nextPow2(parts.length);
    const rounds = Math.log2(size);

    // Build empty match grid
    const matchGrid: TournamentMatch[][] = [];
    for (let r = 1; r <= rounds; r++) {
      const count = size / Math.pow(2, r);
      const roundMatches: TournamentMatch[] = [];
      for (let pos = 0; pos < count; pos++) {
        const m = this.matchRepo.create({ tournamentId, round: r, position: pos, status: 'pending' });
        roundMatches.push(await this.matchRepo.save(m));
      }
      matchGrid.push(roundMatches);
    }

    // Wire next-match pointers
    for (let r = 0; r < matchGrid.length - 1; r++) {
      for (let pos = 0; pos < matchGrid[r].length; pos++) {
        matchGrid[r][pos].nextMatchId = matchGrid[r + 1][Math.floor(pos / 2)].id;
        await this.matchRepo.save(matchGrid[r][pos]);
      }
    }

    // Fill round 1 with players and handle BYEs
    const r1 = matchGrid[0];
    for (let i = 0; i < r1.length; i++) {
      const p1 = parts[i * 2]     ?? null;
      const p2 = parts[i * 2 + 1] ?? null;
      r1[i].player1Id = p1?.userId ?? null;
      r1[i].player2Id = p2?.userId ?? null;

      if (p1 && !p2) {
        r1[i].status   = 'bye';
        r1[i].winnerId = p1.userId;
        await this.matchRepo.save(r1[i]);
        await this._advanceSEWinner(r1[i]);
      } else if (p1 && p2) {
        r1[i].status = 'ready';
        await this.matchRepo.save(r1[i]);
      }
    }

    return this.getBracket(tournamentId);
  }

  // ── ROUND ROBIN ────────────────────────────────────────────────────────────

  async generateRoundRobinBracket(tournamentId: string) {
    const t = await this.repo.findOne({
      where: { id: tournamentId },
      relations: ['participants'],
    });
    if (!t) throw new NotFoundException('Tournament not found');

    await this.matchRepo.delete({ tournamentId });

    const parts = [...t.participants].sort(() => Math.random() - 0.5);
    parts.forEach((p, i) => { p.seed = i + 1; });
    await this.partRepo.save(parts);

    const players = parts.map(p => p.userId);
    const n       = players.length;
    // If odd, add a null BYE slot
    const ring    = n % 2 === 0 ? [...players] : [...players, null];
    const rCount  = ring.length - 1;  // number of rounds

    for (let r = 0; r < rCount; r++) {
      const pairings = this._rrPairings(ring, r);
      let pos = 0;
      for (const [a, b] of pairings) {
        const isBye = a === null || b === null;
        const p1    = isBye ? (a ?? b) : a;
        const p2    = isBye ? null : b;

        const m = this.matchRepo.create({
          tournamentId,
          round:     r + 1,
          position:  pos++,
          player1Id: p1 ?? null,
          player2Id: p2 ?? null,
          status:    isBye ? 'bye' : 'ready',
          winnerId:  isBye ? p1 : null,
          nextMatchId: null,
        });
        await this.matchRepo.save(m);
      }
    }

    return this.getBracket(tournamentId);
  }

  /** Standard round-robin rotation: fix index 0, rotate the rest. */
  private _rrPairings(ring: (string | null)[], round: number): [string | null, string | null][] {
    const n    = ring.length;
    const rot  = [...ring.slice(1)];
    // Rotate by 'round' positions
    const idx  = round % (n - 1);
    const rotated = [...rot.slice(idx), ...rot.slice(0, idx)];
    const circle  = [ring[0], ...rotated];

    const pairs: [string | null, string | null][] = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push([circle[i], circle[n - 1 - i]]);
    }
    return pairs;
  }

  // ── READ BRACKET ───────────────────────────────────────────────────────────

  async getBracket(tournamentId: string) {
    const t = await this.repo.findOne({ where: { id: tournamentId } });
    if (!t) throw new NotFoundException();

    const matches = await this.matchRepo.find({
      where: { tournamentId },
      order: { round: 'ASC', position: 'ASC' },
    });
    const parts = await this.partRepo.find({
      where: { tournamentId },
      relations: ['user'],
    });
    const userMap = Object.fromEntries(parts.map(p => [p.userId, p.user]));
    const maxRound = matches.reduce((m, x) => Math.max(m, x.round), 0);

    // For DE label generation
    const isDE = t.format === TournamentFormat.DOUBLE_ELIM;
    let wbRounds = 0, lbRounds = 0;
    if (isDE) {
      wbRounds = matches.filter(m => m.bracket === 'winners')
        .reduce((mx, m) => Math.max(mx, m.round), 0);
      lbRounds = matches.filter(m => m.bracket === 'losers')
        .reduce((mx, m) => Math.max(mx, m.round - wbRounds), 0);
    }

    const rounds: any[] = [];
    for (let r = 1; r <= maxRound; r++) {
      const roundMatches = matches.filter(m => m.round === r);
      let label: string;
      if (t.format === TournamentFormat.ROUND_ROBIN) {
        label = `Round ${r}`;
      } else if (isDE && roundMatches.length) {
        label = deRoundLabel(roundMatches[0].bracket, r, wbRounds, lbRounds);
      } else {
        label = seRoundLabel(r, maxRound);
      }
      rounds.push({
        round: r,
        label,
        bracket: isDE && roundMatches.length ? roundMatches[0].bracket : undefined,
        matches: roundMatches.map(m => ({
          ...m,
          player1: m.player1Id ? userMap[m.player1Id] : null,
          player2: m.player2Id ? userMap[m.player2Id] : null,
          winner:  m.winnerId  ? userMap[m.winnerId]  : null,
        })),
      });
    }

    // For Round Robin, append standings
    let standings: any[] | undefined;
    if (t.format === TournamentFormat.ROUND_ROBIN) {
      standings = this._computeRRStandings(matches, parts, userMap);
    }

    return { tournamentId, format: t.format, rounds, standings };
  }

  private _computeRRStandings(
    matches: TournamentMatch[],
    parts: TournamentParticipant[],
    userMap: Record<string, any>,
  ) {
    const stats: Record<string, { wins: number; losses: number; draws: number; points: number }> = {};
    for (const p of parts) {
      stats[p.userId] = { wins: 0, losses: 0, draws: 0, points: 0 };
    }
    for (const m of matches) {
      if (m.status !== 'done') continue;
      if (!m.player1Id || !m.player2Id) continue;  // skip BYEs
      if (m.winnerId) {
        const loserId = m.player1Id === m.winnerId ? m.player2Id : m.player1Id;
        stats[m.winnerId].wins++;
        stats[m.winnerId].points += 3;
        if (loserId && stats[loserId]) { stats[loserId].losses++; }
      } else {
        // draw
        stats[m.player1Id].draws++;
        stats[m.player1Id].points++;
        stats[m.player2Id].draws++;
        stats[m.player2Id].points++;
      }
    }
    return parts
      .map(p => ({ user: userMap[p.userId], ...stats[p.userId] }))
      .sort((a, b) => b.points - a.points || b.wins - a.wins);
  }

  // ── REPORT RESULT ──────────────────────────────────────────────────────────

  async reportResult(tournamentId: string, matchId: string, winnerId: string | null) {
    const match = await this.matchRepo.findOne({ where: { id: matchId, tournamentId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.status === 'done') throw new BadRequestException('Match already done');
    if (match.status === 'bye')  throw new BadRequestException('Cannot report result for BYE');

    if (winnerId && match.player1Id !== winnerId && match.player2Id !== winnerId)
      throw new BadRequestException('Winner is not a player in this match');

    const t = await this.repo.findOne({ where: { id: tournamentId } });

    match.winnerId = winnerId;
    match.status   = 'done';
    await this.matchRepo.save(match);

    const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;

    if (winnerId) {
      await this.partRepo.increment({ tournamentId, userId: winnerId }, 'wins',   1);
    }
    if (loserId) {
      await this.partRepo.increment({ tournamentId, userId: loserId },  'losses', 1);
      if (t?.format === TournamentFormat.SINGLE_ELIM) {
        await this.partRepo.update({ tournamentId, userId: loserId }, { eliminated: true });
        await this._advanceSEWinner(match);
      } else if (t?.format === TournamentFormat.DOUBLE_ELIM) {
        // Winner advances within its bracket. Loser drops to LB if WB; eliminated otherwise.
        await this._advanceSEWinner(match);
        if (match.bracket === 'winners') {
          await this._advanceDELoser(match);
        } else {
          // LB or GF loss = elimination
          await this.partRepo.update({ tournamentId, userId: loserId }, { eliminated: true });
        }
      }
    } else if (winnerId && t?.format === TournamentFormat.DOUBLE_ELIM) {
      // Defensive: winner with no loser (BYE-like state shouldn't happen here, but advance anyway)
      await this._advanceSEWinner(match);
    }

    await this._checkTournamentComplete(tournamentId, t?.format);
    return this.getBracket(tournamentId);
  }

  // ── AUTO-SCHEDULER ─────────────────────────────────────────────────────────

  /**
   * Runs every minute — auto-starts PENDING tournaments whose startsAt has passed.
   * Grace period: if <2 players at startsAt, wait AUTO_CANCEL_GRACE_MS before cancelling
   * so late joiners can still register.
   */
  private static readonly AUTO_CANCEL_GRACE_MS = 10 * 60 * 1000;  // 10 minutes

  @Cron(CronExpression.EVERY_MINUTE)
  async autoStartDueTournaments() {
    const due = await this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.participants', 'p')
      .where('t.status = :s', { s: TournamentStatus.PENDING })
      .andWhere('t.startsAt IS NOT NULL')
      .andWhere('t.startsAt <= NOW()')
      .getMany();

    for (const t of due) {
      if (t.participants.length >= 2) {
        this.log.log(`Auto-starting tournament ${t.id} "${t.name}"`);
        try {
          await this.start(t.id);
        } catch (e) {
          this.log.error(`Failed to auto-start ${t.id}`, e);
        }
        continue;
      }
      // <2 players: wait grace window before cancelling
      const elapsed = Date.now() - new Date(t.startsAt).getTime();
      if (elapsed >= TournamentsService.AUTO_CANCEL_GRACE_MS) {
        this.log.warn(`Auto-cancel tournament ${t.id} "${t.name}" — <2 players after grace period`);
        await this.repo.update(t.id, { status: TournamentStatus.CANCELLED });
      } else {
        this.log.log(`Holding ${t.id} "${t.name}" — ${t.participants.length}/2 players, ${Math.ceil((TournamentsService.AUTO_CANCEL_GRACE_MS - elapsed)/1000)}s grace remaining`);
      }
    }
  }

  /** Runs every minute — fires due schedule configs and creates new tournaments. */
  @Cron(CronExpression.EVERY_MINUTE)
  async fireSchedules() {
    const schedules = await this.schedRepo.find({ where: { enabled: true } });
    const now = new Date();

    for (const sched of schedules) {
      if (!sched.nextRunAt) {
        await this._updateNextRunAt(sched);
        continue;
      }
      if (sched.nextRunAt > now) continue;

      // Fire: create a new tournament
      const startsAt = new Date(now.getTime() + sched.registrationHours * 3600_000);
      const name = `${sched.name} ${formatDateLabel(startsAt)}`;
      try {
        await this.create(
          name,
          sched.format,
          sched.maxPlayers,
          sched.rulesType,
          undefined,
          startsAt,
          true,
        );
        this.log.log(`Schedule "${sched.name}" fired → created "${name}"`);
      } catch (e) {
        this.log.error(`Schedule "${sched.name}" create failed`, e);
      }

      sched.lastRunAt = now;
      await this._updateNextRunAt(sched);
      await this.schedRepo.save(sched);
    }
  }

  private async _updateNextRunAt(sched: TournamentSchedule) {
    try {
      const job = new CronJob(sched.cronExpression, () => {});
      sched.nextRunAt = job.nextDate().toJSDate();
    } catch {
      sched.nextRunAt = null;
    }
    await this.schedRepo.save(sched);
  }

  private async refreshNextRunTimes() {
    const scheds = await this.schedRepo.find();
    for (const s of scheds) await this._updateNextRunAt(s);
  }

  // ── SCHEDULE CRUD ──────────────────────────────────────────────────────────

  async listSchedules() {
    return this.schedRepo.find({ order: { createdAt: 'ASC' } });
  }

  async createSchedule(dto: {
    name: string;
    format: TournamentFormat;
    rulesType: string;
    maxPlayers: number;
    cronExpression: string;
    registrationHours: number;
    enabled: boolean;
  }) {
    // Validate cron expression
    try {
      new CronJob(dto.cronExpression, () => {});
    } catch {
      throw new BadRequestException('Invalid cron expression');
    }
    const s = this.schedRepo.create(dto);
    await this.schedRepo.save(s);
    await this._updateNextRunAt(s);
    return s;
  }

  async updateSchedule(id: string, dto: Partial<{
    name: string;
    format: TournamentFormat;
    rulesType: string;
    maxPlayers: number;
    cronExpression: string;
    registrationHours: number;
    enabled: boolean;
  }>) {
    const s = await this.schedRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Schedule not found');
    if (dto.cronExpression && dto.cronExpression !== s.cronExpression) {
      try { new CronJob(dto.cronExpression, () => {}); }
      catch { throw new BadRequestException('Invalid cron expression'); }
    }
    Object.assign(s, dto);
    await this.schedRepo.save(s);
    await this._updateNextRunAt(s);
    return s;
  }

  async deleteSchedule(id: string) {
    const s = await this.schedRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Schedule not found');
    await this.schedRepo.remove(s);
    return { ok: true };
  }

  // ── INTERNALS ──────────────────────────────────────────────────────────────

  private async _advanceSEWinner(match: TournamentMatch) {
    if (!match.nextMatchId || !match.winnerId) return;
    const next = await this.matchRepo.findOne({ where: { id: match.nextMatchId } });
    if (!next) return;
    if (!next.player1Id) next.player1Id = match.winnerId;
    else next.player2Id = match.winnerId;
    if (next.player1Id && next.player2Id) next.status = 'ready';
    await this.matchRepo.save(next);
  }

  private async _checkTournamentComplete(tournamentId: string, format?: TournamentFormat) {
    const total  = await this.matchRepo.count({ where: { tournamentId } });
    const done   = await this.matchRepo.count({ where: { tournamentId, status: 'done' as any } });
    const byes   = await this.matchRepo.count({ where: { tournamentId, status: 'bye'  as any } });
    if (done + byes >= total) {
      await this.repo.update(tournamentId, { status: TournamentStatus.COMPLETED });
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function seRoundLabel(round: number, maxRound: number): string {
  const diff = maxRound - round;
  if (diff === 0) return 'Final';
  if (diff === 1) return 'Semi-final';
  if (diff === 2) return 'Quarter-final';
  return `Round ${round}`;
}

/**
 * Number of matches in LB round `lr` (1-based) for a tournament with `wbRounds`.
 * For wbRounds=3 (size=8):  [2,2,1,1]
 * For wbRounds=4 (size=16): [4,4,2,2,1,1]
 * For wbRounds=2 (size=4):  [1,1]
 *
 * Pattern: drop-in (odd lr) and consolidation (even lr) come in pairs of equal size,
 * starting at size = wbRound1MatchCount/2 = 2^(wbRounds-2), halving every pair.
 */
function lbMatchCount(wbRounds: number, lr: number): number {
  if (wbRounds < 2) return 0;
  const pairIdx = Math.floor((lr - 1) / 2);  // 0,0,1,1,2,2,...
  return Math.max(1, Math.pow(2, wbRounds - 2 - pairIdx));
}

function deRoundLabel(bracket: string, round: number, wbRounds: number, lbRounds: number): string {
  if (bracket === 'grand') return 'Grand Final';
  if (bracket === 'winners') {
    const diff = wbRounds - round;
    if (diff === 0) return 'WB Final';
    if (diff === 1) return 'WB Semi';
    return `WB Round ${round}`;
  }
  // losers
  const lr = round - wbRounds;
  if (lr === lbRounds) return 'LB Final';
  if (lr === lbRounds - 1) return 'LB Semi';
  return `LB Round ${lr}`;
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
