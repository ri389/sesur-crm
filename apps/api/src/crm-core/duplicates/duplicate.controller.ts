import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { MergeDuplicatesDto } from './dto/merge-duplicates.dto';
import { DuplicateService } from './duplicate.service';

@Controller('duplicates')
export class DuplicateController {
  constructor(private readonly duplicates: DuplicateService) {}

  @Post('merge')
  @RequirePermission('duplicate', 'merge')
  @HttpCode(HttpStatus.OK)
  async merge(
    @Body() dto: MergeDuplicatesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.duplicates.merge(dto.type, dto.keepId, dto.dropId, user.id);
  }
}
