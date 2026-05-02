import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async register(email: string, username: string, password: string) {
    const user = await this.usersService.create({ email, username, passwordHash: password });
    return this.generateTokens(user);
  }

  async validateLocal(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');
    const valid = await this.usersService.verifyPassword(user, password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  async validateGoogle(profile: any): Promise<User> {
    let user = await this.usersService.findByOAuth('google', profile.id);
    if (!user) {
      user = await this.usersService.create({
        email: profile.emails[0].value,
        username: profile.displayName.replace(/\s+/g, '_').toLowerCase(),
        oauthProvider: 'google',
        oauthId: profile.id,
        avatarUrl: profile.photos?.[0]?.value,
      });
    }
    return user;
  }

  async generateTokens(user: User) {
    // Ensure rating relation is loaded
    if (!user.rating) {
      const full = await this.usersService.findById(user.id);
      user = full;
    }
    const payload = { sub: user.id, username: user.username, email: user.email };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES', '180d'),
    });
    return {
      accessToken,
      refreshToken,
      user: {
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
      },
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, { secret: this.config.get('JWT_REFRESH_SECRET') });
      const user = await this.usersService.findById(payload.sub);
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
