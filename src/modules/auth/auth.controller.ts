import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UsePipes,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000, keyPrefix: 'auth' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { access_token, refresh_token, user } = await this.authService.login(loginDto);
    this.setRefreshCookie(res, refresh_token);
    return { access_token, refresh_token, user };
  }

  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 60_000, keyPrefix: 'auth' })
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async register(@Body() registerDto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { access_token, refresh_token, user } = await this.authService.register(registerDto);
    this.setRefreshCookie(res, refresh_token);
    return { access_token, user };
  }

  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 60_000, keyPrefix: 'auth' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.['refresh_token'];
    const { access_token, refresh_token } = await this.authService.refresh(token);
    this.setRefreshCookie(res, refresh_token);
    return { access_token };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.['refresh_token'];
    await this.authService.logout(token);
    res.clearCookie('refresh_token', this.cookieOptions());
    return { ok: true };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie('refresh_token', token, this.cookieOptions());
  }

  private cookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      path: '/auth/login',
      maxAge: Number(process.env.JWT_REFRESH_TTL_SEC ?? 60 * 60 * 24 * 30) * 1000,
    };
  }
}
