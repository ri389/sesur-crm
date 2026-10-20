import { IsIn, IsUUID } from 'class-validator';

export class MergeDuplicatesDto {
  @IsIn(['LEAD', 'CONTACT', 'ORGANIZATION'])
  type!: 'LEAD' | 'CONTACT' | 'ORGANIZATION';

  @IsUUID()
  keepId!: string;

  @IsUUID()
  dropId!: string;
}
