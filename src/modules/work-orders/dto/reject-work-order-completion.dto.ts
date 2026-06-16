import { IsNotEmpty, IsString } from 'class-validator';

export class RejectWorkOrderCompletionDto {
  @IsString()
  @IsNotEmpty({ message: 'O motivo da reprovação é obrigatório.' })
  readonly reason: string;
}
