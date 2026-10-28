import {
  IsArray,
  IsBoolean,
  IsEmail,
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsUUID()
  roleId!: string;
}

export class CreateBulkInvitationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique((email: string) => email.trim().toLowerCase())
  @IsEmail({}, { each: true })
  @MaxLength(254, { each: true })
  emails!: string[];

  @IsUUID()
  roleId!: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string | null;

  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  roleIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTeamDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string | null;
}
