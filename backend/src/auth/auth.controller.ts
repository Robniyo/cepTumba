import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthTokenPayload } from './types/auth-token-payload.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('admin/bootstrap')
  async bootstrapAdmin(
    @Body() dto: BootstrapAdminDto,
    @Headers('x-admin-setup-key') setupKey: string | undefined,
  ) {
    const user = await this.authService.bootstrapAdmin(dto, setupKey);
    return { user };
  }

  @UseGuards(AccessTokenGuard)
  @Post('admin/users')
  async createUserAsAdmin(
    @Body() dto: CreateAdminUserDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    const user = await this.authService.createUserAsAdmin(dto, currentUser.role);
    return { user };
  }

  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.login(dto, response);
  }

  @UseGuards(AccessTokenGuard)
  @Get('me')
  async me(@CurrentUser() currentUser: AuthTokenPayload | undefined) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    const user = await this.authService.me(currentUser.sub);
    return { user };
  }

  @UseGuards(AccessTokenGuard)
  @Patch('me')
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    const user = await this.authService.updateProfile(currentUser.sub, dto);
    return { user };
  }

  @UseGuards(AccessTokenGuard)
  @Patch('me/password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.authService.changePassword(currentUser.sub, dto, response);
  }

  @HttpCode(200)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: Request) {
    const ip =
      (request.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ||
      request.socket?.remoteAddress ||
      null;
    return this.authService.forgotPassword(dto, ip);
  }

  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: RefreshDto,
  ) {
    return this.authService.refresh(request, response, dto.refreshToken);
  }

  @HttpCode(200)
  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.logout(request, response);
  }
}
