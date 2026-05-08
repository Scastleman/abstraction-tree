export const defaultServeHost = "127.0.0.1";

export interface ServeHostSelection {
  host: string;
  warning?: string;
}

export function selectServeHost(input?: string): ServeHostSelection {
  const host = input?.trim() || defaultServeHost;
  const warning = isLoopbackHost(host) ? undefined : [
    `Warning: atree serve is binding to ${host}, which may expose /api/state on your network.`,
    `Use the default host ${defaultServeHost} for local-only access.`
  ].join(" ");

  return { host, warning };
}

export function formatServeUrl(host: string, port: number): string {
  return `http://${urlHost(host)}:${port}`;
}

function isLoopbackHost(host: string): boolean {
  const normalized = trimIpv6Brackets(host.trim().toLowerCase());
  if (normalized === "localhost" || normalized === "::1") return true;
  if (!normalized.startsWith("127.")) return false;

  const parts = normalized.split(".");
  return parts.length === 4 && parts.every(part => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function trimIpv6Brackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function urlHost(host: string): string {
  const trimmed = host.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed;
  return trimmed.includes(":") ? `[${trimmed}]` : trimmed;
}
