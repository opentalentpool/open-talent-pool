import { render, screen } from "@testing-library/react";
import { BrandLockup } from "./BrandLockup";

describe("BrandLockup", () => {
  it("usa o icone vetorial da marca no lockup", () => {
    const { container } = render(<BrandLockup />);

    expect(screen.getByLabelText("OpenTalentPool")).toBeInTheDocument();
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute("src", expect.stringContaining("favicon.svg"));
  });
});
