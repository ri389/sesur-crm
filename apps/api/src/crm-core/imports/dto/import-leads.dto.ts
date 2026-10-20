import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { CreateLeadDto } from '../../leads/dto/create-lead.dto';

export class ImportLeadsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateLeadDto)
  rows!: CreateLeadDto[];
}
