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
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { CreateSavingsWithdrawalRequestDto } from './dto/create-savings-withdrawal-request.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';

@UseGuards(AccessTokenGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  async listRequests(@CurrentUser() currentUser: AuthTokenPayload | undefined) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const items = await this.requestsService.listRequests(currentUser);
    return { items };
  }

  @Post()
  async createRequest(
    @Body() dto: CreateRequestDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const request = await this.requestsService.createRequest(dto, currentUser);
    return { request };
  }

  @Post('savings-withdrawal')
  async createSavingsWithdrawalRequest(
    @Body() dto: CreateSavingsWithdrawalRequestDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const request = await this.requestsService.createSavingsWithdrawalRequest(dto, currentUser);
    return { request };
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRequestStatusDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const request = await this.requestsService.updateStatus(id, dto, currentUser);
    return { request };
  }

  @Delete(':id')
  async deleteRequest(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.requestsService.deleteRequest(id, currentUser);
  }
}
