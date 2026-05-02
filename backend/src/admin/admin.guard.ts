import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const token = req.headers['x-admin-key'];
    const secret = process.env.ADMIN_SECRET || 'checkers-admin-2026';
    if (!token || token !== secret) {
      throw new UnauthorizedException('Invalid admin key');
    }
    return true;
  }
}
