import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RejectWorkOrderCompletionDto {
  @IsString()
  @IsNotEmpty({ message: 'O motivo da reprovação é obrigatório.' })
  readonly reason: string;

  /**
   * Coluna de execução de destino (ex.: ao reprovar arrastando no kanban).
   * Se omitida, usa a coluna padrão de "em andamento".
   */
  @IsOptional()
  @IsString({ message: 'Coluna de destino inválida.' })
  readonly columnId?: string;
}
