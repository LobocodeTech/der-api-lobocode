import { IsEnum, IsString, IsOptional } from 'class-validator';
import { IsCUID } from '../../../shared/validators';
import { DocumentRecipientType } from '@prisma/client';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';

export class CreateDocumentDto {
  @IsEnum(DocumentRecipientType, {
    message: VALIDATION_MESSAGES.FORMAT.ENUM_INVALID,
  })
  recipientType: DocumentRecipientType;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  description?: string;

  @IsCUID({ message: VALIDATION_MESSAGES.FORMAT.UUID_INVALID })
  fileId: string;
}
