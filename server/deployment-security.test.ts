import fs from "fs";
import path from "path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const projectRoot = path.resolve(__dirname, "..");

describe("deployment security headers", () => {
  it("serve o frontend estático com headers de segurança no nginx", () => {
    const nginxConfig = fs.readFileSync(path.join(projectRoot, "nginx.conf"), "utf8");

    expect(nginxConfig).toContain("map $http_x_forwarded_proto $forwarded_proto");
    expect(nginxConfig).toContain("server_tokens off;");
    expect(nginxConfig).toContain("add_header Content-Security-Policy");
    expect(nginxConfig).toContain("default-src 'self'");
    expect(nginxConfig).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(nginxConfig).toContain("frame-src 'self' https://challenges.cloudflare.com");
    expect(nginxConfig).toContain("frame-ancestors 'none'");
    expect(nginxConfig).toContain("add_header X-Frame-Options \"DENY\" always");
    expect(nginxConfig).toContain("add_header X-Content-Type-Options \"nosniff\" always");
    expect(nginxConfig).toContain("add_header Referrer-Policy \"strict-origin-when-cross-origin\" always");
    expect(nginxConfig).toContain("add_header Permissions-Policy");
    expect(nginxConfig).toContain("location ~ /\\.(?!well-known(?:/|$))");
  });

  it("não tenta carregar fontes externas bloqueadas pela CSP", () => {
    const frontendCss = fs.readFileSync(path.join(projectRoot, "src", "index.css"), "utf8");

    expect(frontendCss).not.toContain("fonts.googleapis.com");
    expect(frontendCss).not.toContain("fonts.gstatic.com");
    expect(frontendCss).not.toMatch(/@import\s+url\(["']https?:\/\//);
  });

  it("bloqueia framing também nas respostas da API", async () => {
    const app = createApp({
      config: {
        appBaseUrl: "https://opentalentpool.org",
        trustedOrigins: ["https://opentalentpool.org"],
        trustProxy: false,
        isProduction: true,
        nodeEnv: "production",
      },
    });

    const response = await request(app).get("/api/health");

    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers["x-frame-options"]).toBe("DENY");
  });
});

describe("deployment proxy topology", () => {
  it("publica HTTPS por proxy Caddy containerizado no profile de produção", () => {
    const composeConfig = fs.readFileSync(path.join(projectRoot, "docker-compose.yml"), "utf8");
    const caddyConfig = fs.readFileSync(path.join(projectRoot, "docker", "caddy", "Caddyfile"), "utf8");

    expect(composeConfig).toContain("proxy:");
    expect(composeConfig).toContain("image: caddy:");
    expect(composeConfig).toContain("profiles:");
    expect(composeConfig).toContain("- production");
    expect(composeConfig).toContain("\"${HTTP_PUBLISHED_PORT:-80}:80\"");
    expect(composeConfig).toContain("\"${HTTPS_PUBLISHED_PORT:-443}:443\"");
    expect(composeConfig).toContain("./docker/caddy/Caddyfile:/etc/caddy/Caddyfile:ro");
    expect(composeConfig).toContain("caddy_data:");
    expect(composeConfig).toContain("caddy_config:");
    expect(caddyConfig).toContain("{$APP_DOMAIN}");
    expect(caddyConfig).toContain("-Server");
    expect(caddyConfig).toContain('Strict-Transport-Security "max-age=31536000; includeSubDomains"');
    expect(caddyConfig).toContain("reverse_proxy web:80");
    expect(caddyConfig).toContain("header_down -Server");
  });

  it("preserva o protocolo original do proxy antes de encaminhar para a API", () => {
    const nginxConfig = fs.readFileSync(path.join(projectRoot, "nginx.conf"), "utf8");

    expect(nginxConfig).toContain("proxy_set_header X-Forwarded-Proto $forwarded_proto");
  });
});

describe("deployment container packaging", () => {
  it("preserva o layout necessário para imports compartilhados do backend", () => {
    const dockerfile = fs.readFileSync(path.join(projectRoot, "Dockerfile"), "utf8");

    expect(dockerfile).toContain("WORKDIR /app/server");
    expect(dockerfile).toContain("COPY --from=server-deploy /app/package.json /app/package.json");
    expect(dockerfile).toContain("COPY --from=server-deploy /prod/server /app/server");
    expect(dockerfile).toContain("COPY --from=server-deploy /app/src/lib /app/src/lib");
  });
});

describe("production deploy script", () => {
  it("faz pull fast-forward, rollout do profile de produção e smoke checks", () => {
    const deployScript = fs.readFileSync(path.join(projectRoot, "deploy.sh"), "utf8");

    expect(deployScript).toContain("set -Eeuo pipefail");
    expect(deployScript).toContain("git pull --ff-only origin");
    expect(deployScript).toContain("ensure_production_env");
    expect(deployScript).toContain("docker compose --profile production");
    expect(deployScript).toContain("docker compose --profile production config --quiet");
    expect(deployScript).toContain("docker compose --profile production up -d --build");
    expect(deployScript).toContain("docker compose --profile production up -d --no-deps --force-recreate proxy");
    expect(deployScript).toContain("/api/health");
  });
});
