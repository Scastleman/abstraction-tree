import { createHash, timingSafeEqual } from "node:crypto";

export const defaultServeHost = "127.0.0.1";
export const serveTokenEnvVar = "ATREE_SERVE_TOKEN";

export interface ServeHostSelection {
  host: string;
  warning?: string;
}

export interface ServeAuthSelection {
  token?: string;
  tokenSource?: "option" | "environment";
  error?: string;
}

export function selectServeHost(input?: string): ServeHostSelection {
  const host = input?.trim() || defaultServeHost;
  const warning = isLoopbackHost(host) ? undefined : [
    `Warning: atree serve is binding to ${host}, which may expose /api/state on your network.`,
    `Network hosts require /api/state bearer-token authentication.`,
    `Use the default host ${defaultServeHost} for local-only access.`
  ].join(" ");

  return { host, warning };
}

export function selectServeAuth(
  host: string,
  tokenInput?: string,
  env: Record<string, string | undefined> = process.env
): ServeAuthSelection {
  const optionToken = normalizeExplicitToken(tokenInput);
  if (optionToken.error) return { error: optionToken.error };
  if (optionToken.token) {
    return {
      token: optionToken.token,
      tokenSource: "option"
    };
  }

  const envToken = normalizeOptionalToken(env[serveTokenEnvVar]);
  if (envToken) {
    return {
      token: envToken,
      tokenSource: "environment"
    };
  }

  if (!isLoopbackHost(host)) {
    return {
      error: [
        `Refusing to serve /api/state on non-loopback host ${host} without authentication.`,
        `Pass --token <token>, set ${serveTokenEnvVar}, or use the default host ${defaultServeHost}.`
      ].join(" ")
    };
  }

  return {};
}

export function isServeRequestAuthorized(
  authorizationHeader: string | string[] | undefined,
  expectedToken?: string
): boolean {
  if (!expectedToken) return true;
  if (Array.isArray(authorizationHeader)) return authorizationHeader.some(header => isServeRequestAuthorized(header, expectedToken));
  if (!authorizationHeader) return false;

  const match = /^Bearer\s+(.+)$/iu.exec(authorizationHeader.trim());
  if (!match) return false;

  const receivedToken = match[1].trim();
  if (!receivedToken) return false;

  return safeTokenEquals(receivedToken, expectedToken);
}

export function formatServeUrl(host: string, port: number): string {
  return `http://${urlHost(host)}:${port}`;
}

export function browserServeUrl(host: string, port: number): string {
  const normalized = trimIpv6Brackets(host.trim().toLowerCase());
  if (normalized === "localhost" || normalized.startsWith("127.") || normalized === "0.0.0.0" || normalized === "::") {
    return formatServeUrl(defaultServeHost, port);
  }
  return formatServeUrl(host, port);
}

export function isLoopbackHost(host: string): boolean {
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

function normalizeExplicitToken(input: string | undefined): { token?: string; error?: string } {
  if (input === undefined) return {};

  const token = input.trim();
  if (!token) return { error: "Serve token cannot be empty." };
  if (/\s/u.test(token)) return { error: "Serve token must not contain whitespace." };
  return { token };
}

function normalizeOptionalToken(input: string | undefined): string | undefined {
  const token = input?.trim();
  if (!token || /\s/u.test(token)) return undefined;
  return token;
}

function safeTokenEquals(receivedToken: string, expectedToken: string): boolean {
  const receivedHash = hashToken(receivedToken);
  const expectedHash = hashToken(expectedToken);
  return timingSafeEqual(receivedHash, expectedHash);
}

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}
