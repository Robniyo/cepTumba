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
import { WelfareService } from './welfare.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { AddCaseNoteDto } from './dto/add-case-note.dto';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';

@UseGuards(AccessTokenGuard)
@Controller('welfare')
export class WelfareController {
  constructor(private readonly welfareService: WelfareService) {}

  // Cases
  @Get('cases')
  async listCases(@CurrentUser() currentUser: AuthTokenPayload | undefined) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const items = await this.welfareService.listCases(currentUser);
    return { items };
  }

  @Post('cases')
  async createCase(
    @Body() dto: CreateCaseDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const welfareCase = await this.welfareService.createCase(dto, currentUser);
    return { case: welfareCase };
  }

  @Patch('cases/:caseId')
  async updateCase(
    @Param('caseId') caseId: string,
    @Body() dto: UpdateCaseDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const welfareCase = await this.welfareService.updateCase(caseId, dto, currentUser);
    return { case: welfareCase };
  }

  @Delete('cases/:caseId')
  async deleteCase(
    @Param('caseId') caseId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.welfareService.deleteCase(caseId, currentUser);
  }

  @Post('cases/:caseId/notes')
  async addCaseNote(
    @Param('caseId') caseId: string,
    @Body() dto: AddCaseNoteDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const note = await this.welfareService.addCaseNote(caseId, dto, currentUser);
    return { note };
  }

  // Visits
  @Get('visits')
  async listVisits(@CurrentUser() currentUser: AuthTokenPayload | undefined) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const items = await this.welfareService.listVisits(currentUser);
    return { items };
  }

  @Post('visits')
  async createVisit(
    @Body() dto: CreateVisitDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const visit = await this.welfareService.createVisit(dto, currentUser);
    return { visit };
  }

  @Patch('visits/:visitId')
  async updateVisit(
    @Param('visitId') visitId: string,
    @Body() dto: UpdateVisitDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const visit = await this.welfareService.updateVisit(visitId, dto, currentUser);
    return { visit };
  }

  @Delete('visits/:visitId')
  async deleteVisit(
    @Param('visitId') visitId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.welfareService.deleteVisit(visitId, currentUser);
  }

  @Post('visits/:visitId/attendees/:memberId')
  async toggleAttendee(
    @Param('visitId') visitId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const visit = await this.welfareService.toggleAttendee(visitId, memberId, currentUser);
    return { visit };
  }
}
