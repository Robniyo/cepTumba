import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthTokenPayload } from '../auth/types/auth-token-payload.type';

@Controller()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  // Public endpoint used by the landing page
  @Post('contacts')
  async create(@Body() dto: CreateContactDto) {
    const contact = await this.contactsService.createContact(dto);
    return { contact };
  }

  // Protected list for leaders (president, secretary)
  @UseGuards(AccessTokenGuard)
  @Get('contacts')
  async list(@CurrentUser() currentUser: AuthTokenPayload | undefined) {
    const items = await this.contactsService.listContacts(currentUser);
    return { items };
  }

  // Get replies for a contact
  @UseGuards(AccessTokenGuard)
  @Get('contacts/:id/replies')
  async getReplies(@Param('id') contactId: string) {
    const replies = await this.contactsService.getReplies(contactId);
    return { replies };
  }

  // Create a reply to a contact
  @UseGuards(AccessTokenGuard)
  @Post('contacts/:id/replies')
  async createReply(
    @Param('id') contactId: string,
    @Body() body: { reply: string },
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    const reply = await this.contactsService.createReply(contactId, body.reply, currentUser);
    return { reply };
  }
}
