import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { VALIDATION_MESSAGES } from 'src/shared/common/messages';

export class UpdateWorkOrderChecklistItemDto {
  @IsOptional()
  @IsBoolean({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  isDone?: boolean;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  label?: string;
}
