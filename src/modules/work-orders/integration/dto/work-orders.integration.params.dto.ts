import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { VALIDATION_MESSAGES } from 'src/shared/common/messages';
import { IsCUID } from 'src/shared/validators';

export class WorkOrderIntegrationIdParamDto {
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @IsCUID({ message: VALIDATION_MESSAGES.FORMAT.UUID_INVALID })
  id: string;
}

export class WorkOrderIntegrationSequentialParamDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @Matches(/^OS-\d+$/i, {
    message: 'Número sequencial inválido. Use o formato OS-<número>.',
  })
  sequentialNumber: string;
}
