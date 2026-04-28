import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppThemeProvider } from "@/components/AppThemeProvider";
import { MobileNav } from "@/components/MobileNav";

const mockUseAuth = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

describe("MobileNav", () => {
  it("deixa a escolha de tema dentro do menu lateral móvel", async () => {
    const user = userEvent.setup();
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
          <MobileNav user={null} dashboardLabel="Meu painel" onSignOut={vi.fn()} />
        </MemoryRouter>
      </AppThemeProvider>,
    );

    expect(screen.queryByRole("radiogroup", { name: /tema da interface/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /abrir opções de tema/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /abrir menu/i }));

    expect(await screen.findByRole("radiogroup", { name: /tema da interface/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /claro/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /escuro/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /sistema/i })).toBeInTheDocument();
  });

  it("renderiza uma área rolável própria e usa o vocabulário de perfil no menu autenticado", async () => {
    const user = userEvent.setup();
    const scrollToMock = vi.fn();
    const originalScrollTo = HTMLElement.prototype.scrollTo;

    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollToMock,
    });

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

    try {
      render(
        <AppThemeProvider>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <MobileNav
              user={{
                id: 1,
                name: "Ada",
                email: "ada@example.com",
                role: "professional",
                activeRole: "professional",
                availableRoles: ["professional", "recruiter"],
                is_verified: true,
              }}
              dashboardLabel="Meu painel"
              onSignOut={vi.fn()}
            />
          </MemoryRouter>
        </AppThemeProvider>,
      );

      await user.click(screen.getByRole("button", { name: /abrir menu/i }));

      const scrollArea = await screen.findByTestId("mobile-nav-scroll-area");

      expect(scrollArea.className).toContain("overflow-y-auto");
      expect(scrollArea.className).toContain("overscroll-contain");
      expect(screen.getByText(/perfis da conta/i)).toBeInTheDocument();
      expect(screen.getByText(/perfil ativo nesta sessão\./i)).toBeInTheDocument();
      expect(screen.getByText(/trocar para este perfil sem novo login\./i)).toBeInTheDocument();
      expect(screen.queryByText(/contexto da conta/i)).not.toBeInTheDocument();
      expect(scrollToMock).toHaveBeenCalledWith({ top: 0 });
    } finally {
      Object.defineProperty(HTMLElement.prototype, "scrollTo", {
        configurable: true,
        value: originalScrollTo,
      });
    }
  });
});
