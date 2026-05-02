import {
  Controller, Get, Post, Delete, Patch, Param, Body,
  UseGuards, Request, Optional,
} from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';

@Controller('tournaments')
export class TournamentsController {
  constructor(private svc: TournamentsService) {}

  // ── Public — no auth required ─────────────────────────────────────────────

  @Get()
  findAll() { return this.svc.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.svc.findOne(id); }

  @Get(':id/bracket')
  getBracket(@Param('id') id: string) { return this.svc.getBracket(id); }

  @Get(':id/participants')
  getParticipants(@Param('id') id: string) { return this.svc.getParticipants(id); }

  // ── Auth required — any logged-in player ─────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() body: any, @Request() req) {
    return this.svc.create(
      body.name,
      body.format,
      body.maxPlayers ?? 8,
      body.rulesType ?? 'russian',
      req.user.id,
      body.startsAt ? new Date(body.startsAt) : undefined,
    );
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  join(@Param('id') id: string, @Request() req) {
    return this.svc.join(id, req.user.id);
  }

  @Delete(':id/join')
  @UseGuards(JwtAuthGuard)
  leave(@Param('id') id: string, @Request() req) {
    return this.svc.leave(id, req.user.id);
  }

  // ── Player-driven match play (JWT, must be a player in the match) ─────────

  @Post(':tid/matches/:mid/start-room')
  @UseGuards(JwtAuthGuard)
  startRoom(
    @Param('tid') tid: string,
    @Param('mid') mid: string,
    @Request() req,
  ) {
    return this.svc.startRoom(tid, mid, req.user.id);
  }

  @Post(':tid/matches/:mid/set-room')
  @UseGuards(JwtAuthGuard)
  setRoom(
    @Param('tid') tid: string,
    @Param('mid') mid: string,
    @Body() body: { roomId: string },
    @Request() req,
  ) {
    return this.svc.setRoom(tid, mid, req.user.id, body.roomId);
  }

  @Post(':tid/matches/:mid/report')
  @UseGuards(JwtAuthGuard)
  playerReport(
    @Param('tid') tid: string,
    @Param('mid') mid: string,
    @Body() body: { winnerId: string | null },
    @Request() req,
  ) {
    return this.svc.playerReportResult(tid, mid, req.user.id, body.winnerId);
  }

  // ── Admin — requires X-Admin-Key header ───────────────────────────────────

  @Post('admin-create')
  @UseGuards(AdminGuard)
  adminCreate(@Body() body: any) {
    return this.svc.create(
      body.name,
      body.format,
      body.maxPlayers ?? 8,
      body.rulesType ?? 'russian',
      undefined,
      body.startsAt ? new Date(body.startsAt) : undefined,
    );
  }

  @Post(':id/start')
  @UseGuards(AdminGuard)
  start(@Param('id') id: string) { return this.svc.start(id); }

  @Post(':id/cancel')
  @UseGuards(AdminGuard)
  cancel(@Param('id') id: string) { return this.svc.cancel(id); }

  @Post(':id/matches/:matchId/result')
  @UseGuards(AdminGuard)
  reportResult(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: { winnerId: string | null },
  ) { return this.svc.reportResult(id, matchId, body.winnerId); }

  // ── Admin — schedule management ───────────────────────────────────────────

  @Get('schedules/list')
  @UseGuards(AdminGuard)
  listSchedules() { return this.svc.listSchedules(); }

  @Post('schedules')
  @UseGuards(AdminGuard)
  createSchedule(@Body() body: any) { return this.svc.createSchedule(body); }

  @Patch('schedules/:id')
  @UseGuards(AdminGuard)
  updateSchedule(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateSchedule(id, body);
  }

  @Delete('schedules/:id')
  @UseGuards(AdminGuard)
  deleteSchedule(@Param('id') id: string) { return this.svc.deleteSchedule(id); }
}
