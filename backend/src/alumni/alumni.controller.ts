import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AuthTokenPayload } from '../auth/types/auth-token-payload.type';
import { AddContributionDto } from './dto/add-contribution.dto';
import { CreateAlumniDto } from './dto/create-alumni.dto';
import { UpdateAlumniDto } from './dto/update-alumni.dto';
import { AlumniService } from './alumni.service';

@UseGuards(AccessTokenGuard)
@Controller('alumni')
export class AlumniController {
  constructor(private readonly alumniService: AlumniService) {}

  @Get()
  async listAlumni(
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    const items = await this.alumniService.listAlumni(currentUser.role);
    return { items };
  }

  @Post()
  async createAlumni(
    @Body() dto: CreateAlumniDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    const alumni = await this.alumniService.createAlumni(dto, currentUser.role);
    return { alumni };
  }

  @Patch(':memberId')
  async updateAlumni(
    @Param('memberId') memberId: string,
    @Body() dto: UpdateAlumniDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    const alumni = await this.alumniService.updateAlumni(
      memberId,
      dto,
      currentUser.role,
    );
    return { alumni };
  }

  @Post(':memberId/contributions')
  async addContribution(
    @Param('memberId') memberId: string,
    @Body() dto: AddContributionDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    const alumni = await this.alumniService.addContribution(
      memberId,
      dto.amount,
      currentUser.role,
    );
    return { alumni };
  }

  @Delete(':memberId')
  async deleteAlumni(
    @Param('memberId') memberId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.alumniService.deleteAlumni(memberId, currentUser.role);
  }
}
