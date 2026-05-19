import { AssetType } from '@prisma/client';

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  CAMERA: 'Câmera',
  ATDB: 'ATDB',
  PMV: 'PMV',
  OTHER: 'Equipamento',
};

/** Rótulo amigável do tipo de equipamento (ex.: CAMERA → Câmera). */
export function formatAssetTypeLabel(
  type: AssetType | string | null | undefined,
): string {
  if (type == null || type === '') {
    return ASSET_TYPE_LABELS.OTHER;
  }
  const key = String(type).trim().toUpperCase() as AssetType;
  return ASSET_TYPE_LABELS[key] ?? ASSET_TYPE_LABELS.OTHER;
}
