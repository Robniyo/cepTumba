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
import { PrayerCenterService } from './prayer-center.service';
import { CreatePrayerRequestDto } from './dto/create-prayer-request.dto';
import { UpdatePrayerStatusDto } from './dto/update-prayer-status.dto';
import { CreateCounselingRequestDto } from './dto/create-counseling-request.dto';
import { UpdateCounselingStatusDto } from './dto/update-counseling-status.dto';
import { CreateTestimonyDto } from './dto/create-testimony.dto';

@UseGuards(AccessTokenGuard)
@Controller('prayer-center')
export class PrayerCenterController {
  constructor(private readonly prayerCenterService: PrayerCenterService) {}

  // Prayer requests
  @Get('prayers')
  async listPrayers(@CurrentUser() currentUser: AuthTokenPayload | undefined) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const items = await this.prayerCenterService.listPrayerRequests(currentUser);
    return { items };
  }

  @Post('prayers')
  async createPrayer(
    @Body() dto: CreatePrayerRequestDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const request = await this.prayerCenterService.createPrayerRequest(dto, currentUser);
    return { request };
  }

  @Patch('prayers/:id/status')
  async updatePrayerStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePrayerStatusDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const request = await this.prayerCenterService.updatePrayerStatus(id, dto, currentUser);
    return { request };
  }

  @Delete('prayers/:id')
  async deletePrayer(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.prayerCenterService.deletePrayerRequest(id, currentUser);
  }

  // Counseling
  @Get('counseling')
  async listCounseling(@CurrentUser() currentUser: AuthTokenPayload | undefined) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const items = await this.prayerCenterService.listCounselingRequests(currentUser);
    return { items };
  }

  @Post('counseling')
  async createCounseling(
    @Body() dto: CreateCounselingRequestDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const request = await this.prayerCenterService.createCounselingRequest(dto, currentUser);
    return { request };
  }

  @Patch('counseling/:id/status')
  async updateCounseling(
    @Param('id') id: string,
    @Body() dto: UpdateCounselingStatusDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const request = await this.prayerCenterService.updateCounselingStatus(id, dto, currentUser);
    return { request };
  }

  @Delete('counseling/:id')
  async deleteCounseling(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.prayerCenterService.deleteCounselingRequest(id, currentUser);
  }

  // Testimonies
  @Get('testimonies')
  async listTestimonies() {
    const items = await this.prayerCenterService.listTestimonies();
    return { items };
  }

  @Post('testimonies')
  async createTestimony(
    @Body() dto: CreateTestimonyDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const testimony = await this.prayerCenterService.createTestimony(dto, currentUser);
    return { testimony };
  }

  @Delete('testimonies/:id')
  async deleteTestimony(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.prayerCenterService.deleteTestimony(id, currentUser);
  }
}
