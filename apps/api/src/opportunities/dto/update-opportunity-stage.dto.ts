import { OpportunityStage } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateOpportunityStageDto {
  @IsEnum(OpportunityStage)
  stage!: OpportunityStage;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  lostReason?: string;
}
