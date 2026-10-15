import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Request, Response, CookieOptions } from 'express';
import { ADMIN_ROLES, AppRole } from './auth-role.type';
import { AuthUser } from './types/auth-user.type';
import { AuthTokenPayload } from './types/auth-token-payload.type';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserRecord, UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

type AuthSuccessResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.usersService.ensureAuthColumns();
    await this.seedPresidentUser();
  }

  private async seedPresidentUser(): Promise<void> {
    const email = this.configService.get<string>('SEED_PRESIDENT_EMAIL');
    const password = this.configService.get<string>('SEED_PRESIDENT_PASSWORD');
    const name =
      this.configService.get<string>('SEED_PRESIDENT_NAME') ?? 'President';

    if (!email || !password) {
      this.logger.log(
        'Skipping president seed (SEED_PRESIDENT_EMAIL/SEED_PRESIDENT_PASSWORD not set)',
      );
      return;
    }

    const usersCount = await this.usersService.countUsers();
    if (usersCount > 0) {
      return;
    }

    const passwordHash = await this.hashPassword(password);
    await this.usersService.createUser({
      email,
      passwordHash,
      name,
      role: 'president',
    });
    this.logger.log(`Seeded initial president user: ${email}`);
  }

  async bootstrapAdmin(
    dto: BootstrapAdminDto,
    setupKey: string | undefined,
  ): Promise<AuthUser> {
    const expectedSetupKey = this.configService.get<string>('ADMIN_SETUP_KEY');
    if (!expectedSetupKey) {
      throw new ForbiddenException('ADMIN_SETUP_KEY is not configured');
    }

    if (!setupKey || setupKey !== expectedSetupKey) {
      throw new UnauthorizedException('Invalid admin setup key');
    }

    const usersCount = await this.usersService.countUsers();
    if (usersCount > 0) {
      throw new ForbiddenException(
        'Bootstrap admin is disabled after the first user is created',
      );
    }

    const passwordHash = await this.hashPassword(dto.password);
    const user = await this.usersService.createUser({
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: 'president',
    });

    return this.toAuthUser(user);
  }

  async createUserAsAdmin(
    dto: CreateAdminUserDto,
    creatorRole: AppRole,
  ): Promise<AuthUser> {
    if (!ADMIN_ROLES.includes(creatorRole)) {
      throw new ForbiddenException(
        'Only association administrators can create users',
      );
    }

    const passwordHash = await this.hashPassword(dto.password);
    const user = await this.usersService.createUser({
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: dto.role,
    });

    return this.toAuthUser(user);
  }

  async login(dto: LoginDto, response: Response): Promise<AuthSuccessResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenException('This account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.usersService.touchLastLogin(user.id);
    return this.issueSession(user, response);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found');
    }
    return this.toAuthUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<AuthUser> {
    if (dto.name === undefined && dto.email === undefined) {
      throw new BadRequestException(
        'Provide at least one profile field to update',
      );
    }

    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found');
    }

    const updatedUser = await this.usersService.updateProfile(user.id, {
      email: dto.email,
      name: dto.name,
    });

    return this.toAuthUser(updatedUser);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    response: Response,
  ): Promise<AuthSuccessResponse> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const isSamePassword = await bcrypt.compare(
      dto.newPassword,
      user.passwordHash,
    );

    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const newPasswordHash = await this.hashPassword(dto.newPassword);
    await this.usersService.updatePasswordHash(user.id, newPasswordHash);

    const refreshedUser = await this.usersService.findById(user.id);
    if (!refreshedUser || !refreshedUser.isActive) {
      throw new UnauthorizedException('User not found');
    }

    return this.issueSession(refreshedUser, response);
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
    requestedIp?: string | null,
  ): Promise<{ ok: true }> {
    // Always return ok to avoid leaking which emails exist.
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (user && user.isActive) {
      const ttlSeconds = this.getPasswordResetTtlSeconds();
      const rawToken = randomBytes(32).toString('hex'); // 64 hex chars
      const tokenHash = await bcrypt.hash(rawToken, this.getBcryptSaltRounds());
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      await this.usersService.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt,
        requestedIp: requestedIp ?? null,
      });

      const resetUrl = this.buildPasswordResetUrl(rawToken);
      await this.notificationsService
        .sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          resetUrl,
          expiresAt,
        })
        .catch((err) => {
          this.logger.error(
            `Failed to send password reset email to ${user.email}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    } else {
      this.logger.debug(
        `Password reset requested for unknown or inactive email: ${email}`,
      );
    }

    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    const rawToken = dto.token.trim();
    if (!rawToken) {
      throw new BadRequestException('Reset token is required');
    }

    // We must check the token against every active token's hash.
    // To bound work, we only consider tokens that haven't expired.
    const candidate = await this.findValidResetToken(rawToken);
    if (!candidate) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.usersService.findById(candidate.userId);
    if (!user || !user.isActive) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (user.passwordHash) {
      const isSamePassword = await bcrypt.compare(
        dto.newPassword,
        user.passwordHash,
      );
      if (isSamePassword) {
        throw new BadRequestException(
          'New password must be different from current password',
        );
      }
    }

    const newPasswordHash = await this.hashPassword(dto.newPassword);
    await this.usersService.updatePasswordHash(user.id, newPasswordHash);
    // Invalidate any existing refresh sessions, forcing re-login.
    await this.usersService.clearRefreshToken(user.id);
    await this.usersService.markPasswordResetTokenUsed(candidate.tokenId);

    return { ok: true };
  }

  private async findValidResetToken(
    rawToken: string,
  ): Promise<{ tokenId: string; userId: string } | null> {
    const tokens = await this.usersService.findAllActivePasswordResetTokens();
    for (const t of tokens) {
      const matches = await bcrypt.compare(rawToken, t.tokenHash);
      if (matches) {
        return { tokenId: t.id, userId: t.userId };
      }
    }
    return null;
  }

  async refresh(
    request: Request,
    response: Response,
    tokenFromBody?: string,
  ): Promise<AuthSuccessResponse> {
    const cookieName = this.getRefreshCookieName();
    const tokenFromCookie = request.cookies?.[cookieName] as string | undefined;
    const refreshToken = tokenFromBody || tokenFromCookie;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    let payload: AuthTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AuthTokenPayload>(refreshToken, {
        secret: this.getRefreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.kind !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Session has expired');
    }

    if (
      !user.refreshTokenExpiresAt ||
      user.refreshTokenExpiresAt.getTime() <= Date.now()
    ) {
      await this.usersService.clearRefreshToken(user.id);
      throw new UnauthorizedException('Session has expired');
    }

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.refreshTokenHash,
    );

    if (!refreshTokenMatches) {
      await this.usersService.clearRefreshToken(user.id);
      throw new UnauthorizedException('Session has expired');
    }

    return this.issueSession(user, response);
  }

  async logout(request: Request, response: Response): Promise<{ ok: true }> {
    const userId = await this.resolveUserIdForLogout(request);
    if (userId) {
      await this.usersService.clearRefreshToken(userId);
    }

    response.clearCookie(
      this.getRefreshCookieName(),
      this.getRefreshCookieOptions(),
    );

    return { ok: true };
  }

  private async issueSession(
    user: UserRecord,
    response: Response,
  ): Promise<AuthSuccessResponse> {
    const accessPayload: AuthTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      kind: 'access',
    };

    const refreshPayload: AuthTokenPayload = {
      ...accessPayload,
      kind: 'refresh',
    };

    const accessExpiresIn = this.getAccessTokenTtlSeconds();
    const refreshExpiresIn = this.getRefreshTokenTtlSeconds();

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.getAccessSecret(),
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.getRefreshSecret(),
        expiresIn: refreshExpiresIn,
      }),
    ]);

    const refreshTokenHash = await bcrypt.hash(
      refreshToken,
      this.getBcryptSaltRounds(),
    );
    const refreshTokenExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000);

    await this.usersService.setRefreshToken(
      user.id,
      refreshTokenHash,
      refreshTokenExpiresAt,
    );

    response.cookie(
      this.getRefreshCookieName(),
      refreshToken,
      this.getRefreshCookieOptions(),
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: accessExpiresIn,
      user: this.toAuthUser(user),
    };
  }

  private async resolveUserIdForLogout(request: Request): Promise<string | null> {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      const accessToken = authorization.slice('Bearer '.length).trim();
      try {
        const accessPayload = await this.jwtService.verifyAsync<AuthTokenPayload>(
          accessToken,
          { secret: this.getAccessSecret() },
        );
        if (accessPayload.kind === 'access') {
          return accessPayload.sub;
        }
      } catch {
        // ignore and fallback to refresh token
      }
    }

    const refreshToken = request.cookies?.[
      this.getRefreshCookieName()
    ] as string | undefined;
    if (!refreshToken) {
      return null;
    }

    try {
      const refreshPayload = await this.jwtService.verifyAsync<AuthTokenPayload>(
        refreshToken,
        {
          secret: this.getRefreshSecret(),
        },
      );
      if (refreshPayload.kind === 'refresh') {
        return refreshPayload.sub;
      }
    } catch {
      return null;
    }

    return null;
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.getBcryptSaltRounds());
  }

  private toAuthUser(user: UserRecord): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  private getAccessSecret(): string {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }
    return secret;
  }

  private getRefreshSecret(): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }
    return secret;
  }

  private getAccessTokenTtlSeconds(): number {
    const rawValue = Number(
      this.configService.get<string>('JWT_ACCESS_TTL_SECONDS') ?? '900',
    );
    return Number.isNaN(rawValue) ? 900 : rawValue;
  }

  private getRefreshTokenTtlSeconds(): number {
    const rawValue = Number(
      this.configService.get<string>('JWT_REFRESH_TTL_SECONDS') ?? '604800',
    );
    return Number.isNaN(rawValue) ? 604800 : rawValue;
  }

  private getBcryptSaltRounds(): number {
    const rawValue = Number(
      this.configService.get<string>('BCRYPT_SALT_ROUNDS') ?? '12',
    );
    return Number.isNaN(rawValue) ? 12 : rawValue;
  }

  private getRefreshCookieName(): string {
    return this.configService.get<string>('REFRESH_COOKIE_NAME') ?? 'cep_refresh';
  }

  private getRefreshCookieOptions(): CookieOptions {
    const isProduction =
      (this.configService.get<string>('NODE_ENV') ?? 'development') ===
      'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/auth',
      maxAge: this.getRefreshTokenTtlSeconds() * 1000,
    };
  }

  private getPasswordResetTtlSeconds(): number {
    const rawValue = Number(
      this.configService.get<string>('PASSWORD_RESET_TTL_SECONDS') ?? '900',
    );
    return Number.isNaN(rawValue) || rawValue <= 0 ? 900 : rawValue;
  }

  private getFrontendBaseUrl(): string {
    const raw =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:8081';
    return raw.replace(/\/$/, '');
  }

  private buildPasswordResetUrl(token: string): string {
    const base = this.getFrontendBaseUrl();
    return `${base}/reset-password?token=${encodeURIComponent(token)}`;
  }
}
