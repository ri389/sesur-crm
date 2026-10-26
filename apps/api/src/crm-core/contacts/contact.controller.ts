import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Contact } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';
import { ContactService } from './contact.service';

@Controller('contacts')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Get()
  @RequirePermission('contact', 'read')
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
    @Query('search') search?: string,
  ): Promise<Contact[]> {
    return this.contactService.findAll({ organizationId, search }, user);
  }

  @Get(':id')
  @RequirePermission('contact', 'read')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Contact> {
    return this.contactService.findById(id, user);
  }

  @Post()
  @RequirePermission('contact', 'create')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateContactDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Contact> {
    return this.contactService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('contact', 'update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Contact> {
    return this.contactService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('contact', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.contactService.delete(id, user.id);
  }
}
