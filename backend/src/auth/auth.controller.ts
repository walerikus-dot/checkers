import { Controller, Post, Get, Body, UseGuards, Request, Res, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { UsersService } from '../users/users.service';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';

class RegisterDto {
  @IsEmail() email: string;
  @IsString() @MinLength(3) @MaxLength(50) username: string;
  @IsString() @MinLength(8) password: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res) {
    const tokens = await this.authService.register(dto.email, dto.username, dto.password);
    res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api', maxAge: 180 * 24 * 60 * 60 * 1000 });
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  async login(@Request() req, @Res({ passthrough: true }) res) {
    const tokens = await this.authService.generateTokens(req.user);
    res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api', maxAge: 180 * 24 * 60 * 60 * 1000 });
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Request() req, @Res() res) {
    const tokens = await this.authService.generateTokens(req.user);
    res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 180 * 24 * 60 * 60 * 1000 });
    // Redirect to game client with token in fragment so HTML can pick it up
    const clientUrl = process.env.GAME_CLIENT_URL || '/checkers-final.html';
    const fragment = `oauth_token=${encodeURIComponent(tokens.accessToken)}&oauth_user=${encodeURIComponent(JSON.stringify(tokens.user))}`;
    res.redirect(`${clientUrl}#${fragment}`);
  }

  @Post('refresh')
  async refresh(@Request() req, @Res({ passthrough: true }) res) {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('No refresh token');
    const tokens = await this.authService.refreshTokens(refreshToken);
    res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api', maxAge: 180 * 24 * 60 * 60 * 1000 });
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Res({ passthrough: true }) res) {
    res.clearCookie('refreshToken');
    return { message: 'Logged out' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Request() req) {
    const user = await this.usersService.findById(req.user.id);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      country: user.country || null,
      countryCode: user.countryCode || null,
      phone: user.phone || null,
      language: user.language || null,
      pendingEmail: user.pendingEmail || null,
      rating: user.rating ? {
        rating: Math.round(user.rating.rating),
        rd: Math.round(user.rating.rd),
        gamesPlayed: user.rating.gamesPlayed,
        wins: user.rating.wins,
        losses: user.rating.losses,
        draws: user.rating.draws,
      } : null,
      progress: {
        xp: user.xp || 0,
        credits: user.credits || 0,
        streak: user.streak || 0,
        totalWins: user.totalWins || 0,
        totalGames: user.totalGames || 0,
        firstWinBonus: user.firstWinBonus || false,
      },
    };
  }

  /* ── Google ID token login (for mobile/PWA) ── */

  @Post('google/token')
  async googleTokenLogin(@Body('credential') credential: string, @Res({ passthrough: true }) res) {
    if (!credential) throw new BadRequestException('Missing credential');

    // Verify the Google ID token
    const { OAuth2Client } = require('google-auth-library');
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    const client = new OAuth2Client(clientId);

    let payload: any;
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
      payload = ticket.getPayload();
    } catch (e) {
      throw new BadRequestException('Invalid Google token');
    }

    if (!payload || !payload.email) throw new BadRequestException('Invalid token payload');

    // Find or create user
    let user = await this.usersService.findByOAuth('google', payload.sub);
    if (!user) {
      // Check if email already registered with local auth
      user = await this.usersService.findByEmail(payload.email);
      if (user) {
        // Link Google to existing account
        await this.usersService.update(user.id, { oauthProvider: 'google', oauthId: payload.sub, avatarUrl: payload.picture || user.avatarUrl } as any);
        user = await this.usersService.findById(user.id);
      } else {
        // Create new user
        const username = (payload.name || payload.email.split('@')[0]).replace(/\s+/g, '_').toLowerCase().substring(0, 50);
        user = await this.usersService.create({
          email: payload.email,
          username,
          oauthProvider: 'google',
          oauthId: payload.sub,
          avatarUrl: payload.picture,
        });
      }
    }

    const tokens = await this.authService.generateTokens(user);
    res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api', maxAge: 180 * 24 * 60 * 60 * 1000 });
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  /* ── Forgot password ──────────────────────── */

  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    if (!email) throw new BadRequestException('Email is required');
    const user = await this.usersService.findByEmail(email);
    // Always return success to avoid email enumeration
    if (!user) return { ok: true, message: 'If this email is registered, a reset link has been sent.' };

    // Generate a short-lived reset token (15 min)
    const resetToken = this.jwtService.sign(
      { sub: user.id, purpose: 'password-reset' },
      { secret: this.config.get('JWT_ACCESS_SECRET'), expiresIn: '15m' },
    );

    // Send email
    const clientUrl = this.config.get('GAME_CLIENT_URL') || 'https://chashki.duckdns.org/checkers-final.html';
    const resetLink = `${clientUrl}#reset_token=${resetToken}`;

    try {
      await this.sendResetEmail(user.email, user.username, resetLink);
    } catch (e) {
      console.error('Failed to send reset email:', e.message);
      throw new BadRequestException('Failed to send email. Please contact support.');
    }

    return { ok: true, message: 'If this email is registered, a reset link has been sent.' };
  }

  @Post('reset-password')
  async resetPassword(@Body('token') token: string, @Body('password') password: string) {
    if (!token || !password) throw new BadRequestException('Token and password are required');
    if (password.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    let payload: any;
    try {
      payload = this.jwtService.verify(token, { secret: this.config.get('JWT_ACCESS_SECRET') });
    } catch {
      throw new BadRequestException('Reset link has expired or is invalid. Please request a new one.');
    }

    if (payload.purpose !== 'password-reset') {
      throw new BadRequestException('Invalid reset token');
    }

    const user = await this.usersService.findById(payload.sub);
    const hashed = await bcrypt.hash(password, 12);
    await this.usersService.update(user.id, { passwordHash: hashed } as any);

    return { ok: true, message: 'Password has been reset successfully. You can now log in.' };
  }

  /* ── Change password (authenticated, current+new) ── */

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Request() req,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    const { currentPassword, newPassword } = body || {};
    if (!currentPassword || !newPassword) throw new BadRequestException('Current and new passwords are required');
    if (newPassword.length < 8) throw new BadRequestException('New password must be at least 8 characters');
    const user = await this.usersService.findById(req.user.id);
    if (!user) throw new BadRequestException('User not found');
    if (!user.passwordHash) throw new BadRequestException('Account has no password set (use Forgot password to create one)');
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');
    if (currentPassword === newPassword) throw new BadRequestException('New password must differ from current');
    const hashed = await bcrypt.hash(newPassword, 12);
    await this.usersService.update(user.id, { passwordHash: hashed } as any);
    return { ok: true, message: 'Password changed successfully.' };
  }

  /* ── Email change (re-confirm via email link) ── */

  @Post('request-email-change')
  @UseGuards(JwtAuthGuard)
  async requestEmailChange(
    @Request() req,
    @Body() body: { newEmail?: string; currentPassword?: string },
  ) {
    const { newEmail, currentPassword } = body || {};
    if (!newEmail || !currentPassword) throw new BadRequestException('New email and current password are required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new BadRequestException('Invalid email format');
    const user = await this.usersService.findById(req.user.id);
    if (!user) throw new BadRequestException('User not found');
    if (!user.passwordHash) throw new BadRequestException('Account has no password set — cannot change email this way');
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');
    if (newEmail.toLowerCase() === (user.email || '').toLowerCase()) throw new BadRequestException('New email must differ from current');
    const taken = await this.usersService.findByEmail(newEmail);
    if (taken) throw new BadRequestException('Email is already in use');

    const token = require('crypto').randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await this.usersService.update(user.id, {
      pendingEmail: newEmail,
      emailChangeToken: token,
      emailChangeTokenExpires: expires,
    } as any);

    const clientUrl = this.config.get('GAME_CLIENT_URL') || 'https://chashki.duckdns.org/checkers-final.html';
    const confirmLink = `${clientUrl}#confirm_email=${token}`;
    try {
      await this.sendEmailChangeEmail(newEmail, user.username, user.email, confirmLink);
    } catch (e) {
      console.error('Failed to send email-change email:', e.message);
      throw new BadRequestException('Failed to send confirmation email. Please contact support.');
    }
    return { ok: true, message: `Confirmation link sent to ${newEmail}. Open it to finalize the change.` };
  }

  @Post('confirm-email-change')
  async confirmEmailChange(@Body('token') token: string) {
    if (!token) throw new BadRequestException('Token is required');
    const user = await this.usersService.findByEmailChangeToken(token);
    if (!user) throw new BadRequestException('Invalid or expired confirmation link');
    if (!user.emailChangeTokenExpires || user.emailChangeTokenExpires.getTime() < Date.now()) {
      await this.usersService.update(user.id, { pendingEmail: null, emailChangeToken: null, emailChangeTokenExpires: null } as any);
      throw new BadRequestException('Confirmation link has expired. Please request a new one.');
    }
    if (!user.pendingEmail) throw new BadRequestException('No pending email change');
    // Final check: ensure the new email is still free
    const taken = await this.usersService.findByEmail(user.pendingEmail);
    if (taken && taken.id !== user.id) {
      await this.usersService.update(user.id, { pendingEmail: null, emailChangeToken: null, emailChangeTokenExpires: null } as any);
      throw new BadRequestException('That email is no longer available');
    }
    await this.usersService.update(user.id, {
      email: user.pendingEmail,
      pendingEmail: null,
      emailChangeToken: null,
      emailChangeTokenExpires: null,
    } as any);
    return { ok: true, message: 'Email updated.' };
  }

  private async sendEmailChangeEmail(to: string, username: string, oldEmail: string, confirmLink: string) {
    const smtpUser = this.config.get('SMTP_USER');
    const smtpPass = this.config.get('SMTP_PASS');
    if (!smtpUser || !smtpPass) throw new Error('SMTP not configured');
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: smtpUser, pass: smtpPass } });
    await transporter.sendMail({
      from: `"Chashki — Checkers" <${smtpUser}>`,
      to,
      subject: 'Confirm your new email — Chashki',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#1a1a2e;color:#e0e0e0;border-radius:12px;">
          <h2 style="color:#7c5cbf;margin-bottom:16px;">Confirm Email Change</h2>
          <p>Hello <strong>${username}</strong>,</p>
          <p>You requested to change the email on your Chashki account from <strong>${oldEmail}</strong> to <strong>${to}</strong>.</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${confirmLink}" style="display:inline-block;padding:12px 32px;background:#7c5cbf;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
              Confirm New Email
            </a>
          </p>
          <p style="font-size:13px;color:#888;">This link expires in 24 hours. If you didn't request this, you can ignore this email — your account is unchanged.</p>
          <hr style="border:none;border-top:1px solid #2a2a4a;margin:20px 0;">
          <p style="font-size:12px;color:#666;text-align:center;">Chashki — Online Checkers Game</p>
        </div>
      `,
    });
  }

  private async sendResetEmail(to: string, username: string, resetLink: string) {
    const smtpUser = this.config.get('SMTP_USER');
    const smtpPass = this.config.get('SMTP_PASS');
    if (!smtpUser || !smtpPass) {
      throw new Error('SMTP not configured (SMTP_USER / SMTP_PASS missing)');
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"Chashki — Checkers" <${smtpUser}>`,
      to,
      subject: 'Password Reset — Chashki',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#1a1a2e;color:#e0e0e0;border-radius:12px;">
          <h2 style="color:#7c5cbf;margin-bottom:16px;">Password Reset</h2>
          <p>Hello <strong>${username}</strong>,</p>
          <p>We received a request to reset your password. Click the button below to set a new password:</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${resetLink}" style="display:inline-block;padding:12px 32px;background:#7c5cbf;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
              Reset Password
            </a>
          </p>
          <p style="font-size:13px;color:#888;">This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #2a2a4a;margin:20px 0;">
          <p style="font-size:12px;color:#666;text-align:center;">Chashki — Online Checkers Game</p>
        </div>
      `,
    });
  }
}
