import fs from "fs";
import path from "path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const projectRoot = path.resolve(__dirname, "..");

describe("deployment security headers", () => {
  it("serve o frontend estático com headers de segurança no nginx", () => {
    const nginxConfig = fs.readFileSync(path.join(projectRoot, "nginx.conf"), "utf8");

    expect(nginxConfig).toContain("add_header Content-Security-Policy");
    expect(nginxConfig).toContain("default-src 'self'");
    expect(nginxConfig).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(nginxConfig).toContain("frame-src 'self' https://challenges.cloudflare.com");
    expect(nginxConfig).toContain("frame-ancestors 'none'");
    expect(nginxConfig).toContain("add_header X-Frame-Options \"DENY\" always");
    expect(nginxConfig).toContain("add_header X-Content-Type-Options \"nosniff\" always");
    expect(nginxConfig).toContain("add_header Referrer-Policy \"strict-origin-when-cross-origin\" always");
    expect(nginxConfig).toContain("add_header Permissions-Policy");
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
