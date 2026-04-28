import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppThemeProvider } from "@/components/AppThemeProvider";
import { Navbar } from "@/components/Navbar";

const mockUseAuth = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

describe("Navbar", () => {
  it("expõe o switcher de perfil quando a conta tem mais de um papel público", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue({
      user: {
        id: 1,
        name: "Ada",
        email: "ada@example.com",
        role: "professional",
        activeRole: "professional",
        availableRoles: ["professional", "recruiter"],
        is_verified: true,
      },
      loading: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
      switchActiveRole: vi.fn(),
      enableRole: vi.fn(),
    });

    render(
      <AppThemeProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Navbar />
        </MemoryRouter>
      </AppThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: /profissional/i }));

    expect(screen.getByText(/perfis da conta/i)).toBeInTheDocument();
    expect(screen.getByText(/perfil ativo\./i)).toBeInTheDocument();
    expect(screen.queryByText(/contexto da conta/i)).not.toBeInTheDocument();
  });

  it("expõe o controle de tema no header e mantém a navegação principal", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
      switchActiveRole: vi.fn(),
      enableRole: vi.fn(),
    });

    render(
      <AppThemeProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Navbar />
        </MemoryRouter>
      </AppThemeProvider>,
    );

    expect(screen.getByRole("button", { name: /abrir opções de tema/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /buscar talentos/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /abrir menu/i })).toBeInTheDocument();
  });

  it("renderiza a variante document sem sticky, pills ou CTA destacado", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
      switchActiveRole: vi.fn(),
      enableRole: vi.fn(),
    });

    render(
      <AppThemeProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Navbar variant="document" />
        </MemoryRouter>
      </AppThemeProvider>,
    );

    expect(screen.getByTestId("site-navbar")).toHaveAttribute("data-variant", "document");
    expect(screen.getByTestId("site-navbar")).not.toHaveClass("sticky");
    expect(screen.getByRole("link", { name: /início/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /buscar talentos/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /abrir menu/i })).not.toBeInTheDocument();
  });
});
