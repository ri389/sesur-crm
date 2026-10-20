import { Module } from '@nestjs/common';
import { ContactController } from './contacts/contact.controller';
import { ContactService } from './contacts/contact.service';
import { DuplicateController } from './duplicates/duplicate.controller';
import { DuplicateService } from './duplicates/duplicate.service';
import { ImportController } from './imports/import.controller';
import { ImportService } from './imports/import.service';
import { InteractionController } from './interactions/interaction.controller';
import { InteractionService } from './interactions/interaction.service';
import { LeadController } from './leads/lead.controller';
import { LeadService } from './leads/lead.service';
import { OrganizationController } from './organizations/organization.controller';
import { OrganizationService } from './organizations/organization.service';
import { SearchController } from './search/search.controller';
import { SearchService } from './search/search.service';

@Module({
  controllers: [
    LeadController,
    OrganizationController,
    ContactController,
    InteractionController,
    SearchController,
    ImportController,
    DuplicateController,
  ],
  providers: [
    LeadService,
    OrganizationService,
    ContactService,
    InteractionService,
    DuplicateService,
    SearchService,
    ImportService,
  ],
})
export class CrmCoreModule {}
