import { describe, expect, it } from "vitest";
import { isLocalDevelopmentHostname, isLocalDevelopmentOrigin } from "./development-hosts.js";

describe("development-hosts", () => {
  it("reconhece localhost, loopback e IP privado como hosts locais de desenvolvimento", () => {
    expect(isLocalDevelopmentHostname("localhost")).toBe(true);
    expect(isLocalDevelopmentHostname("127.0.0.1")).toBe(true);
    expect(isLocalDevelopmentHostname("::1")).toBe(true);
    expect(isLocalDevelopmentHostname("192.168.0.5")).toBe(true);
    expect(isLocalDevelopmentHostname("10.0.0.12")).toBe(true);
    expect(isLocalDevelopmentHostname("172.20.1.8")).toBe(true);
    expect(isLocalDevelopmentHostname("8.8.8.8")).toBe(false);
    expect(isLocalDevelopmentHostname("evil.example.com")).toBe(false);
  });

  it("aceita origem local de IP privado quando o protocolo e a porta batem com o app local", () => {
    expect(isLocalDevelopmentOrigin("http://192.168.0.5:8080", "http://localhost:8080")).toBe(true);
    expect(isLocalDevelopmentOrigin("http://10.0.0.12:8080", "http://localhost:8080")).toBe(true);
    expect(isLocalDevelopmentOrigin("https://192.168.0.5:8080", "http://localhost:8080")).toBe(false);
    expect(isLocalDevelopmentOrigin("http://192.168.0.5:3000", "http://localhost:8080")).toBe(false);
    expect(isLocalDevelopmentOrigin("https://evil.example.com", "http://localhost:8080")).toBe(false);
  });
});
