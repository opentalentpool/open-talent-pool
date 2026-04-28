function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");
}

function isPrivateIpv4(hostname) {
  const parts = normalizeHostname(hostname).split(".");

  if (parts.length !== 4) {
    return false;
  }

  const octets = parts.map((part) => Number(part));

  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = octets;

  if (first === 10) {
    return true;
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }

  return first === 192 && second === 168;
}

function normalizedPort(url) {
  if (url.port) {
    return url.port;
  }

  return url.protocol === "https:" ? "443" : "80";
}

export function isLocalDevelopmentHostname(hostname) {
  const normalized = normalizeHostname(hostname);

  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || isPrivateIpv4(normalized);
}

export function isLocalDevelopmentOrigin(origin, appBaseUrl = "") {
  try {
    const originUrl = new URL(origin);

    if (!["http:", "https:"].includes(originUrl.protocol)) {
      return false;
    }

    if (!isLocalDevelopmentHostname(originUrl.hostname)) {
      return false;
    }

    if (!appBaseUrl) {
      return true;
    }

    const appUrl = new URL(appBaseUrl);

    return originUrl.protocol === appUrl.protocol && normalizedPort(originUrl) === normalizedPort(appUrl);
  } catch {
    return false;
  }
}
