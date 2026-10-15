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
import { CreateCommitteeDto } from './dto/create-committee.dto';
import { CreateHandoverDto } from './dto/create-handover.dto';
import { CreateTermDto } from './dto/create-term.dto';
import { UpdateCommitteeDto } from './dto/update-committee.dto';
import { UpdateTermStatusDto } from './dto/update-term-status.dto';
import { LeadershipService } from './leadership.service';

@UseGuards(AccessTokenGuard)
@Controller('leadership')
export class LeadershipController {
  constructor(private readonly leadershipService: LeadershipService) {}

  // ---------- Terms ----------

  @Get('terms')
  async listTerms() {
    const items = await this.leadershipService.listTerms();
    return { items };
  }

  @Post('terms')
  async createTerm(
    @Body() dto: CreateTermDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const term = await this.leadershipService.createTerm(dto, currentUser.role);
    return { term };
  }

  @Patch('terms/:id/status')
  async updateTermStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTermStatusDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const term = await this.leadershipService.updateTermStatus(id, dto, currentUser.role);
    return { term };
  }

  @Delete('terms/:id')
  async deleteTerm(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.leadershipService.deleteTerm(id, currentUser.role);
  }

  // ---------- Committees ----------

  @Get('committees')
  async listCommittees() {
    const items = await this.leadershipService.listCommittees();
    return { items };
  }

  @Post('committees')
  async createCommittee(
    @Body() dto: CreateCommitteeDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const committee = await this.leadershipService.createCommittee(dto, currentUser.role);
    return { committee };
  }

  @Patch('committees/:id')
  async updateCommittee(
    @Param('id') id: string,
    @Body() dto: UpdateCommitteeDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const committee = await this.leadershipService.updateCommittee(id, dto, currentUser.role);
    return { committee };
  }

  @Delete('committees/:id')
  async deleteCommittee(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.leadershipService.deleteCommittee(id, currentUser.role);
  }

  // ---------- Handovers ----------

  @Get('handovers')
  async listHandovers() {
    const items = await this.leadershipService.listHandovers();
    return { items };
  }

  @Post('handovers')
  async createHandover(
    @Body() dto: CreateHandoverDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const handover = await this.leadershipService.createHandover(dto, currentUser.role);
    return { handover };
  }

  @Delete('handovers/:id')
  async deleteHandover(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.leadershipService.deleteHandover(id, currentUser.role);
  }
}
