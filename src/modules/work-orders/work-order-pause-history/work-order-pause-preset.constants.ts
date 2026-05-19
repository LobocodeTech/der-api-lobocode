/** Valores aceitos no body (`presetReason`) — apenas validação; persiste-se só em `reason`. */
export enum WorkOrderPausePresetReason {
  VANDALISM_THEFT = 'VANDALISM_THEFT',
  MONITORING_STRUCTURE_INCIDENT = 'MONITORING_STRUCTURE_INCIDENT',
  ROAD_WORKS = 'ROAD_WORKS',
  ADVERSE_WEATHER = 'ADVERSE_WEATHER',
  DATA_LINK_FAILURE = 'DATA_LINK_FAILURE',
  DER_INFRA_REPAIR_REPLACE = 'DER_INFRA_REPAIR_REPLACE',
  EQUIPMENT_MAINTENANCE = 'EQUIPMENT_MAINTENANCE',
  MONITORING_EQUIPMENT_OFFLINE = 'MONITORING_EQUIPMENT_OFFLINE',
  SAMPLE_DATA_INVALID = 'SAMPLE_DATA_INVALID',
  IMAGE_NOT_VISIBLE = 'IMAGE_NOT_VISIBLE',
  IMAGE_MISPOSITIONED = 'IMAGE_MISPOSITIONED',
  MESSAGE_NOT_READABLE = 'MESSAGE_NOT_READABLE',
  VARIABLE_MESSAGE_PANEL_OFF = 'VARIABLE_MESSAGE_PANEL_OFF',
  STREAMING_DELAY = 'STREAMING_DELAY',
  IMAGE_STREAM_AVAILABILITY_OSCILLATION = 'IMAGE_STREAM_AVAILABILITY_OSCILLATION',
  EQUIPMENT_MALFUNCTION = 'EQUIPMENT_MALFUNCTION',
  DATA_LINK_RESTORED = 'DATA_LINK_RESTORED',
  OTHER = 'OTHER',
}

const PAUSE_PRESET_REASONS = new Set<WorkOrderPausePresetReason>([
  WorkOrderPausePresetReason.VANDALISM_THEFT,
  WorkOrderPausePresetReason.MONITORING_STRUCTURE_INCIDENT,
  WorkOrderPausePresetReason.ROAD_WORKS,
  WorkOrderPausePresetReason.ADVERSE_WEATHER,
  WorkOrderPausePresetReason.DATA_LINK_FAILURE,
  WorkOrderPausePresetReason.DER_INFRA_REPAIR_REPLACE,
  WorkOrderPausePresetReason.EQUIPMENT_MAINTENANCE,
  WorkOrderPausePresetReason.OTHER,
]);

const RESUME_PRESET_REASONS = new Set<WorkOrderPausePresetReason>([
  WorkOrderPausePresetReason.MONITORING_EQUIPMENT_OFFLINE,
  WorkOrderPausePresetReason.SAMPLE_DATA_INVALID,
  WorkOrderPausePresetReason.IMAGE_NOT_VISIBLE,
  WorkOrderPausePresetReason.IMAGE_MISPOSITIONED,
  WorkOrderPausePresetReason.MESSAGE_NOT_READABLE,
  WorkOrderPausePresetReason.VARIABLE_MESSAGE_PANEL_OFF,
  WorkOrderPausePresetReason.STREAMING_DELAY,
  WorkOrderPausePresetReason.IMAGE_STREAM_AVAILABILITY_OSCILLATION,
  WorkOrderPausePresetReason.EQUIPMENT_MALFUNCTION,
  WorkOrderPausePresetReason.DATA_LINK_RESTORED,
  WorkOrderPausePresetReason.OTHER,
]);

export function isWorkOrderPausePresetReason(
  preset: WorkOrderPausePresetReason,
): boolean {
  return PAUSE_PRESET_REASONS.has(preset);
}

export function isWorkOrderResumePresetReason(
  preset: WorkOrderPausePresetReason,
): boolean {
  return RESUME_PRESET_REASONS.has(preset);
}

/** Texto gravado no campo `reason` da tabela (sem numeração). */
export const WORK_ORDER_PAUSE_PRESET_STORED_LABELS: Record<
  WorkOrderPausePresetReason,
  string
> = {
  [WorkOrderPausePresetReason.VANDALISM_THEFT]:
    'Vandalismo/furto de equipamentos e cabeamento',
  [WorkOrderPausePresetReason.MONITORING_STRUCTURE_INCIDENT]:
    'Sinistro que envolva a estrutura do ponto de monitoração',
  [WorkOrderPausePresetReason.ROAD_WORKS]:
    'Obras nas vias (recapeamento, instalação de defensa metálica, ampliação, etc.)',
  [WorkOrderPausePresetReason.ADVERSE_WEATHER]:
    'Condições climáticas adversas, impedindo de atuar com segurança',
  [WorkOrderPausePresetReason.DATA_LINK_FAILURE]:
    'Falha no link de dados do local',
  [WorkOrderPausePresetReason.DER_INFRA_REPAIR_REPLACE]:
    'Substituir ou reparar infraestrutura de monitoração que demandem ações do DER/SP',
  [WorkOrderPausePresetReason.EQUIPMENT_MAINTENANCE]:
    'Manutenção de equipamento',
  [WorkOrderPausePresetReason.MONITORING_EQUIPMENT_OFFLINE]:
    'Equipamento de monitoração constar off-line',
  [WorkOrderPausePresetReason.SAMPLE_DATA_INVALID]:
    'Dados de amostras zeradas ou fora do padrão',
  [WorkOrderPausePresetReason.IMAGE_NOT_VISIBLE]: 'Imagem não visível',
  [WorkOrderPausePresetReason.IMAGE_MISPOSITIONED]: 'Imagem mal posicionada',
  [WorkOrderPausePresetReason.MESSAGE_NOT_READABLE]: 'Mensagem não legível',
  [WorkOrderPausePresetReason.VARIABLE_MESSAGE_PANEL_OFF]:
    'Painel de mensagem variável desligado',
  [WorkOrderPausePresetReason.STREAMING_DELAY]: 'Streaming com delay',
  [WorkOrderPausePresetReason.IMAGE_STREAM_AVAILABILITY_OSCILLATION]:
    'Oscilação na disponibilização da imagem/stream',
  [WorkOrderPausePresetReason.EQUIPMENT_MALFUNCTION]:
    'Equipamento com defeito/mau funcionamento',
  [WorkOrderPausePresetReason.DATA_LINK_RESTORED]:
    'Retorno de Link de dados do local',
  [WorkOrderPausePresetReason.OTHER]: 'Outro',
};

export function buildWorkOrderPauseHistoryReason(
  preset: WorkOrderPausePresetReason,
  customReason?: string,
): string {
  if (preset === WorkOrderPausePresetReason.OTHER) {
    const trimmed = customReason?.trim() ?? '';
    return trimmed ? `Outro: ${trimmed}` : 'Outro';
  }
  return WORK_ORDER_PAUSE_PRESET_STORED_LABELS[preset];
}
