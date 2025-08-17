/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, _context: ExecutionContext) {
    if (err || !user) {
      // "info" contains Passport error details like token expired, etc.
      throw err || new UnauthorizedException(info?.message || 'Unauthorized');
    }
    return user;
  }
}
