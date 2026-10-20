import { Controller, Get, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { SearchHit, SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @RequirePermission('search', 'read')
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string,
  ): Promise<{ results: SearchHit[] }> {
    return { results: await this.searchService.search(q ?? '', user) };
  }
}
