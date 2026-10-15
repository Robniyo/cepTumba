import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthTokenPayload } from '../auth/types/auth-token-payload.type';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { RunAssignmentDto } from './dto/run-assignment.dto';
import { SelectParentsDto } from './dto/select-parents.dto';
import { MoveMemberDto } from './dto/move-member.dto';
import { FamiliesService } from './families.service';

@Controller('families')
export class FamiliesController {
  constructor(private readonly familiesService: FamiliesService) {}

  private requireUser(user: AuthTokenPayload | undefined): AuthTokenPayload {
    if (!user) throw new UnauthorizedException('Missing current user');
    return user;
  }

  // --- Read ---
  @UseGuards(AccessTokenGuard)
  @Get()
  async list(@CurrentUser() user: AuthTokenPayload | undefined) {
    const u = this.requireUser(user);
    return this.familiesService.listFamilies(u.role);
  }

  @UseGuards(AccessTokenGuard)
  @Get('reports/summary')
  async report(@CurrentUser() user: AuthTokenPayload | undefined) {
    const u = this.requireUser(user);
    return this.familiesService.getReportSummary(u.role);
  }

  @UseGuards(AccessTokenGuard)
  @Get('assignments/runs')
  async runs(@CurrentUser() user: AuthTokenPayload | undefined) {
    const u = this.requireUser(user);
    return this.familiesService.listAssignmentRuns(u.role);
  }

  // Open to any authenticated user — returns their own family or null.
  @UseGuards(AccessTokenGuard)
  @Get('me')
  async myFamily(@CurrentUser() user: AuthTokenPayload | undefined) {
    const u = this.requireUser(user);
    return this.familiesService.getMyFamily(u.sub);
  }

  @UseGuards(AccessTokenGuard)
  @Get(':familyId')
  async detail(
    @Param('familyId', new ParseUUIDPipe()) familyId: string,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    const u = this.requireUser(user);
    return this.familiesService.getFamily(familyId, u.role);
  }

  // --- Write (President) ---
  @UseGuards(AccessTokenGuard)
  @Post()
  async create(
    @Body() dto: CreateFamilyDto,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    const u = this.requireUser(user);
    return this.familiesService.createFamily(dto, u.role, u.sub);
  }

  @UseGuards(AccessTokenGuard)
  @Patch(':familyId')
  async update(
    @Param('familyId', new ParseUUIDPipe()) familyId: string,
    @Body() dto: UpdateFamilyDto,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    const u = this.requireUser(user);
    return this.familiesService.updateFamily(familyId, dto, u.role);
  }

  @UseGuards(AccessTokenGuard)
  @Delete(':familyId')
  async remove(
    @Param('familyId', new ParseUUIDPipe()) familyId: string,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    const u = this.requireUser(user);
    await this.familiesService.deleteFamily(familyId, u.role);
    return { deletedFamilyId: familyId };
  }

  // --- Assignment (VP-Social) ---
  @UseGuards(AccessTokenGuard)
  @Post('assignments/run')
  async runAssignment(
    @Body() dto: RunAssignmentDto,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    const u = this.requireUser(user);
    return this.familiesService.runAssignment(dto, u.role, u.sub);
  }

  // --- Parent selection (VP-Social) ---
  @UseGuards(AccessTokenGuard)
  @Post(':familyId/parents')
  async selectParents(
    @Param('familyId', new ParseUUIDPipe()) familyId: string,
    @Body() dto: SelectParentsDto,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    const u = this.requireUser(user);
    return this.familiesService.selectParents(familyId, dto, u.role);
  }

  // --- Manual move (VP-Social) ---
  @UseGuards(AccessTokenGuard)
  @Post('memberships/move')
  async moveMember(
    @Body() dto: MoveMemberDto,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    const u = this.requireUser(user);
    return this.familiesService.moveMember(dto, u.role, u.sub);
  }
}
