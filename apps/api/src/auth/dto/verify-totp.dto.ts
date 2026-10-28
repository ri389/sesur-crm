import { AuthMethod } from '@prisma/client';
import {
  IsIn,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class VerifyTotpDto {
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  challengeToken!: string;

  @IsString()
  @Matches(/^\d{6}$/u)
  code!: string;
}

export class ValidateInvitationDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}

export class RegisterDto extends ValidateInvitationDto {
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  draftToken?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword?: string;

  @IsOptional()
  @IsEnum(AuthMethod)
  authMethod?: AuthMethod;

  @ValidateIf((dto: RegisterDto) => dto.authMethod === AuthMethod.WHATSAPP)
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/u, {
    message: 'Saisissez un numéro WhatsApp au format international, par exemple +229XXXXXXXX.',
  })
  whatsappPhone?: string;
}

export class CreateRegistrationDraftDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  invitationToken!: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  draftToken?: string;
}

export class SaveRegistrationDraftDto {
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  draftToken!: string;

  @IsIn(['identity', 'password', 'security'])
  step!: 'identity' | 'password' | 'security';

  @ValidateIf((dto: SaveRegistrationDraftDto) => dto.step === 'identity')
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ValidateIf((dto: SaveRegistrationDraftDto) => dto.step === 'identity')
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ValidateIf((dto: SaveRegistrationDraftDto) => dto.step === 'password')
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @ValidateIf((dto: SaveRegistrationDraftDto) => dto.step === 'password')
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword?: string;

  @ValidateIf((dto: SaveRegistrationDraftDto) => dto.step === 'security')
  @IsEnum(AuthMethod)
  authMethod?: AuthMethod;

  @ValidateIf(
    (dto: SaveRegistrationDraftDto) =>
      dto.step === 'security' && dto.authMethod === AuthMethod.WHATSAPP,
  )
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/u, {
    message: 'Saisissez un numéro WhatsApp au format international.',
  })
  whatsappPhone?: string;
}
