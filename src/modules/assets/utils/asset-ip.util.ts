import { BadRequestException } from '@nestjs/common';
import { AssetIpAddressDto } from '../dto/asset-ip-address.dto';

const IPV4_PATTERN =
  /^(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;

export const ASSET_IP_DESCRIPTION_MAX_LENGTH = 200;

export type AssetIpAddressEntry = {
  ip: string;
  description?: string;
};

function canonicalIpv4(value: string): string {
  return value
    .trim()
    .split('.')
    .map((octet) => String(parseInt(octet, 10)))
    .join('.');
}

function normalizeEntry(raw: unknown): AssetIpAddressEntry | null {
  if (typeof raw === 'string') {
    const ip = canonicalIpv4(raw);
    if (!IPV4_PATTERN.test(ip)) return null;
    return { ip };
  }

  if (!raw || typeof raw !== 'object' || !('ip' in raw)) {
    return null;
  }

  const item = raw as { ip?: unknown; description?: unknown };
  const ip = canonicalIpv4(String(item.ip ?? ''));
  if (!IPV4_PATTERN.test(ip)) return null;

  const description = String(item.description ?? '').trim();
  if (!description) {
    return { ip };
  }

  if (description.length > ASSET_IP_DESCRIPTION_MAX_LENGTH) {
    throw new BadRequestException(
      `Descrição do IP não pode exceder ${ASSET_IP_DESCRIPTION_MAX_LENGTH} caracteres.`,
    );
  }

  return { ip, description };
}

export function normalizarIpAddressesAsset(
  ipAddresses: AssetIpAddressDto[] | null | undefined,
): AssetIpAddressEntry[] | null | undefined {
  if (ipAddresses === undefined) {
    return undefined;
  }

  if (ipAddresses === null) {
    return null;
  }

  if (!Array.isArray(ipAddresses)) {
    throw new BadRequestException('ipAddresses deve ser um array.');
  }

  const uniqueByIp = new Map<string, AssetIpAddressEntry>();

  for (const raw of ipAddresses) {
    const entry = normalizeEntry(raw);
    if (!entry) continue;
    const key = entry.ip.toLowerCase();
    if (!uniqueByIp.has(key)) {
      uniqueByIp.set(key, entry);
    }
  }

  const list = Array.from(uniqueByIp.values());
  return list.length > 0 ? list : null;
}
