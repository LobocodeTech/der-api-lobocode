import { AssetType } from '@prisma/client';

/** Campos mínimos para exibir ou buscar um equipamento (Asset). */
export type AssetDisplayFields = {
  type: AssetType | string;
  name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
};

function normalizeAssetType(type: AssetType | string | null | undefined): string {
  return String(type ?? '').trim().toUpperCase();
}

/** Título principal em listagens e busca global (espelha o frontend). */
export function getAssetDisplayTitle(asset: AssetDisplayFields): string {
  const type = normalizeAssetType(asset.type);

  if (type === AssetType.CAMERA) {
    const manufacturer = asset.manufacturer?.trim();
    const model = asset.model?.trim();
    if (manufacturer && model) return `${manufacturer} — ${model}`;
    if (manufacturer) return manufacturer;
    if (model) return model;
    const serial = asset.serialNumber?.trim();
    if (serial) return `S/N ${serial}`;
    return 'Câmera';
  }

  const name = asset.name?.trim();
  if (name) return name;
  if (type === AssetType.ATDB) return 'ATDB';
  if (type === AssetType.PMV) return 'PMV';
  return 'Equipamento';
}

/** Termo preferencial para query string de busca (atalhos / deep links). */
export function getAssetSearchPathTerm(asset: AssetDisplayFields): string {
  const type = normalizeAssetType(asset.type);

  if (type === AssetType.CAMERA) {
    return (
      asset.manufacturer?.trim() ||
      asset.model?.trim() ||
      asset.serialNumber?.trim() ||
      getAssetDisplayTitle(asset)
    );
  }

  return asset.name?.trim() || getAssetDisplayTitle(asset);
}

/** Cláusulas Prisma `OR` para busca textual em equipamentos. */
export function buildAssetTextSearchOr(contains: {
  contains: string;
  mode: 'insensitive';
}) {
  return [
    { name: contains },
    { manufacturer: contains },
    { model: contains },
    { serialNumber: contains },
  ];
}
