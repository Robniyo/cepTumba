import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsIn, IsString } from 'class-validator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { APP_ROLES } from '../auth/auth-role.type';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthTokenPayload } from '../auth/types/auth-token-payload.type';
import { parseExportFormat } from '../common/export-utils';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateMemberStatusDto } from './dto/update-member-status.dto';
import { MembersService } from './members.service';

class AssignMemberRoleDto {
  @IsString()
  @IsIn(APP_ROLES)
  role!: (typeof APP_ROLES)[number];
}

@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get('public/leadership')
  async listPublicLeadership() {
    return this.membersService.listPublicLeadership();
  }

  @UseGuards(AccessTokenGuard)
  @Get()
  async listMembers(@CurrentUser() currentUser: AuthTokenPayload | undefined) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.membersService.listMembers(currentUser.role);
  }

  @UseGuards(AccessTokenGuard)
  @Get('export')
  async exportMembers(
    @Query('format') format: string | undefined,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    const parsedFormat = parseExportFormat(format);
    const { buffer, contentType, fileName } = await this.membersService.exportMembers(
      parsedFormat,
      currentUser.role,
    );

    response.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });

    return new StreamableFile(buffer);
  }

  @UseGuards(AccessTokenGuard)
  @Post()
  async createMember(
    @Body() dto: CreateMemberDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.membersService.createMember(dto, currentUser.role);
  }

  @UseGuards(AccessTokenGuard)
  @Patch(':memberId/role')
  async assignMemberRole(
    @Param('memberId') memberId: string,
    @Body() dto: AssignMemberRoleDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.membersService.assignMemberRole(
      memberId,
      dto.role,
      currentUser.role,
    );
  }

  @UseGuards(AccessTokenGuard)
  @Patch(':memberId')
  async updateMember(
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.membersService.updateMember(memberId, dto, currentUser.role);
  }

  @UseGuards(AccessTokenGuard)
  @Patch(':memberId/status')
  async updateMemberStatus(
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberStatusDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.membersService.updateMemberStatus(
      memberId,
      dto.status,
      currentUser.role,
    );
  }

  @UseGuards(AccessTokenGuard)
  @Delete(':memberId')
  async deleteMember(
    @Param('memberId') memberId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.membersService.deleteMember(
      memberId,
      currentUser.role,
      currentUser.sub,
    );
  }
}
