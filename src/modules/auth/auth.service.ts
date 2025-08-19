/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from './entities/refresh-token.entity';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';

type JwtPayload = { sub: string; email: string; role: string; jti?: string; fam?: string };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly accessTtlSec = Number(process.env.JWT_EXPIRATION ?? 900);
  private readonly refreshTtlSec = Number(process.env.JWT_REFRESH_TTL_SEC ?? 60 * 60 * 24 * 30);
  private readonly accessSecret = process.env.JWT_SECRET as string;
  private readonly refreshSecret = process.env.JWT_REFRESH_SECRET as string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const { accessToken } = await this.issueAccessToken(user.id, user.email, user.role);
    const familyId = randomUUID();
    const { token: refreshToken, jti } = await this.issueRefreshToken(
      user.id,
      user.email,
      user.role,
      familyId,
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
      familyId,
      jti,
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new UnauthorizedException('Email already exists');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({ ...dto, password: hashed });

    const { accessToken } = await this.issueAccessToken(user.id, user.email, user.role);
    const familyId = randomUUID();
    const { token: refreshToken, jti } = await this.issueRefreshToken(
      user.id,
      user.email,
      user.role,
      familyId,
    );

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      access_token: accessToken,
      refresh_token: refreshToken,
      familyId,
      jti,
    };
  }

  async refresh(oldRefreshToken: string) {
    if (!oldRefreshToken) throw new UnauthorizedException('Missing refresh token');

    let decoded: JwtPayload;
    try {
      decoded = await this.jwtService.verifyAsync<JwtPayload>(oldRefreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { sub: userId, jti, fam: familyId, email, role } = decoded || {};
    if (!userId || !jti || !familyId) throw new UnauthorizedException('Malformed refresh token');

    const row = await this.refreshRepo.findOne({ where: { jti } });
    if (
      !row ||
      row.revoked ||
      row.used ||
      row.userId !== userId ||
      row.expiresAt.getTime() < Date.now()
    ) {
      await this.revokeFamily(familyId);
      throw new ForbiddenException('Refresh token invalidated');
    }

    const matches = await bcrypt.compare(this.fingerprint(oldRefreshToken), row.tokenHash);
    if (!matches) {
      await this.revokeFamily(familyId);
      throw new ForbiddenException('Refresh token reuse detected');
    }

    row.used = true;
    await this.refreshRepo.save(row);

    const { accessToken } = await this.issueAccessToken(userId, email, role);
    const { token: refreshToken, jti: newJti } = await this.issueRefreshToken(
      userId,
      email,
      role,
      familyId,
    );

    return { access_token: accessToken, refresh_token: refreshToken, familyId, jti: newJti };
  }

  // ==== improved logout: log invalids; revoke when expired but valid signature ====
  async logout(currentRefreshToken?: string) {
    if (!currentRefreshToken) return;

    try {
      // Normal path: valid, unexpired token
      const decoded = await this.jwtService.verifyAsync<JwtPayload>(currentRefreshToken, {
        secret: this.refreshSecret,
      });
      if (decoded?.jti) {
        await this.refreshRepo.update({ jti: decoded.jti }, { revoked: true, used: true });
      }
      return;
    } catch (err: any) {
      // If expired, we still want to revoke this exact token (jti) if the signature is valid.
      if (err?.name === 'TokenExpiredError') {
        try {
          const decoded = await this.jwtService.verifyAsync<JwtPayload>(currentRefreshToken, {
            secret: this.refreshSecret,
            ignoreExpiration: true, // still checks signature
          });
          if (decoded?.jti) {
            await this.refreshRepo.update({ jti: decoded.jti }, { revoked: true, used: true });
          }
        } catch (e2: any) {
          // signature invalid or malformed even when ignoring expiration
          this.logger.warn(
            `logout: invalid expired refresh token (cannot verify signature): ${e2?.message || e2}`,
          );
        }
        return;
      }

      // Other verification errors -> just log (don’t trust unverified payloads)
      this.logger.warn(`logout: invalid refresh token: ${err?.message || err}`);
    }
  }

  private async issueAccessToken(userId: string, email: string, role: string) {
    const payload: JwtPayload = { sub: userId, email, role };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessTtlSec,
    });
    return { accessToken };
  }

  private async issueRefreshToken(userId: string, email: string, role: string, familyId: string) {
    const jti = randomUUID();
    const payload: JwtPayload = { sub: userId, email, role, jti, fam: familyId };
    const token = await this.jwtService.signAsync(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshTtlSec,
    });

    const tokenHash = await bcrypt.hash(this.fingerprint(token), 12);
    const expiresAt = new Date(Date.now() + this.refreshTtlSec * 1000);

    await this.refreshRepo.save(
      this.refreshRepo.create({
        userId,
        familyId,
        jti,
        tokenHash,
        revoked: false,
        used: false,
        expiresAt,
      }),
    );

    return { token, jti };
  }

  private fingerprint(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async revokeFamily(familyId: string) {
    await this.refreshRepo
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revoked: true })
      .where('familyId = :fam', { fam: familyId })
      .execute();
  }

  async validateUser(userId: string): Promise<any> {
    return this.usersService.findOne(userId);
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    const user = await this.usersService.findOne(userId);
    if (!user) return false;
    if (requiredRoles?.length) return requiredRoles.includes(user.role);
    return true;
  }
}
