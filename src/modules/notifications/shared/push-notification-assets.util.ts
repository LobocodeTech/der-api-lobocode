/** Caminho estável no frontend (public/), servido igual em dev e prod. */
export const PUSH_NOTIFICATION_ICON_PATH = '/push-icon.png';

/**
 * URL absoluta do ícone/badge de push — exigida para carregar fora do origin em alguns browsers.
 * Evita `/src/assets/...`, que só existe no Vite dev.
 */
export function resolvePushNotificationIconUrl(
  custom?: string | null,
): string {
  const envOverride = process.env.PUSH_NOTIFICATION_ICON_URL?.trim();
  if (envOverride) {
    return envOverride;
  }

  const raw = custom?.trim();
  if (raw && /^https?:\/\//i.test(raw)) {
    return raw;
  }

  const path =
    raw &&
    raw.startsWith('/') &&
    !raw.includes('/src/assets/')
      ? raw
      : PUSH_NOTIFICATION_ICON_PATH;

  const frontendBase = process.env.FRONTEND_URL?.replace(/\/$/, '');
  if (frontendBase) {
    return `${frontendBase}${path}`;
  }

  return path;
}
