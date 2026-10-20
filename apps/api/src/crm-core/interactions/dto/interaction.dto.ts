import { InteractionChannel, InteractionDirection } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateInteractionDto {
  @IsEnum(InteractionChannel)
  channel!: InteractionChannel;

  @IsOptional()
  @IsEnum(InteractionDirection)
  direction?: InteractionDirection;

  @IsString()
  @MaxLength(2000)
  summary!: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
