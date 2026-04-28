import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HowItWorks from "./HowItWorks";

describe("HowItWorks", () => {
  it("resume o fluxo real sem repetir a home em tom genérico", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <HowItWorks />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /como o opentalentpool funciona na prática/i })).toBeInTheDocument();
    expect(screen.getByText(/email com código, perfil editável e publicação manual/i)).toBeInTheDocument();
    expect(screen.getByText(/publicar com clareza antes de aparecer no mercado/i)).toBeInTheDocument();
    expect(screen.getByText(/favoritos, buscas salvas e alertas por e-mail para acompanhamento/i)).toBeInTheDocument();
    expect(screen.queryByText(/junte-se a centenas de profissionais/i)).not.toBeInTheDocument();
  });
});
