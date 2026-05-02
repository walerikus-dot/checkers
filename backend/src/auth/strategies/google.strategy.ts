import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService, private authService: AuthService) {
    super({
      clientID: config.get('GOOGLE_CLIENT_ID') || 'google-oauth-not-configured',
      clientSecret: config.get('GOOGLE_CLIENT_SECRET') || 'google-oauth-not-configured',
      callbackURL: `${config.get('API_URL', 'http://130.12.242.84')}/api/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any) {
    return this.authService.validateGoogle(profile);
  }
}
