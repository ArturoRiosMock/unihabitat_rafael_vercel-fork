import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("redirect=/portal/privado"),
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock server actions
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
vi.mock("@/app/login/actions", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
}));

import LoginPage from "@/app/login/page";

describe("LoginPage registration form", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockSignUp.mockReset();
    mockSignUp.mockResolvedValue({ success: "Cuenta creada." });
  });

  it("shows phone field only in register mode", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    // In login mode, phone field should not exist
    expect(screen.queryByPlaceholderText(/000 00 00 00/)).not.toBeInTheDocument();

    // Switch to register mode
    await user.click(screen.getByText("Registrarse"));

    // Now phone input should be visible
    expect(screen.getByPlaceholderText(/000 00 00 00/)).toBeInTheDocument();
  });

  it("renders country selector defaulting to Spain (+34)", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText("Registrarse"));

    expect(screen.getByText("+34")).toBeInTheDocument();
  });

  it("opens country dropdown and allows searching", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText("Registrarse"));

    // Click country selector
    await user.click(screen.getByText("+34"));

    // Search input should appear
    const searchInput = screen.getByPlaceholderText("Buscar país...");
    expect(searchInput).toBeInTheDocument();

    // Search for "francia"
    await user.type(searchInput, "francia");

    // Francia should be visible
    expect(screen.getByText("Francia")).toBeInTheDocument();
  });

  it("changes country code when selecting a different country", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText("Registrarse"));

    // Open dropdown
    await user.click(screen.getByText("+34"));

    // Search and select US
    const searchInput = screen.getByPlaceholderText("Buscar país...");
    await user.type(searchInput, "estados");
    await user.click(screen.getByText("Estados Unidos"));

    // Should now show +1
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("formats phone number dynamically as user types", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText("Registrarse"));

    const phoneInput = screen.getByPlaceholderText(/000 00 00 00/);
    await user.type(phoneInput, "612345678");

    expect(phoneInput).toHaveValue("612 34 56 78");
  });

  it("updates format placeholder when country changes", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText("Registrarse"));

    // Default Spain format placeholder
    expect(screen.getByPlaceholderText("000 00 00 00")).toBeInTheDocument();

    // Switch to UK
    await user.click(screen.getByText("+34"));
    const searchInput = screen.getByPlaceholderText("Buscar país...");
    await user.type(searchInput, "reino");
    await user.click(screen.getByText("Reino Unido"));

    // UK format placeholder
    expect(screen.getByPlaceholderText("0000 000000")).toBeInTheDocument();
  });

  it("clears phone when switching country", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText("Registrarse"));

    // Type a Spanish number
    const phoneInput = screen.getByPlaceholderText(/000 00 00 00/);
    await user.type(phoneInput, "612345");

    // Switch country
    await user.click(screen.getByText("+34"));
    await user.click(screen.getByText("Francia"));

    // Phone should be cleared — France format placeholder is "0 00 00 00 00"
    const telInput = screen.getByPlaceholderText("0 00 00 00 00") as HTMLInputElement;
    expect(telInput.value).toBe("");
  });

  it("sends phone in form data on registration submit", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText("Registrarse"));

    // Fill form
    await user.type(screen.getByPlaceholderText("Nombre"), "Juan");
    await user.type(screen.getByPlaceholderText("Apellidos"), "Pérez");
    await user.type(screen.getByPlaceholderText(/000 00 00 00/), "612345678");
    await user.type(screen.getByPlaceholderText("tu@email.com"), "juan@test.com");
    await user.type(screen.getByPlaceholderText("Mínimo 6 caracteres"), "secret123");
    await user.type(screen.getByPlaceholderText("Repite la contraseña"), "secret123");

    // Submit
    await user.click(screen.getByText("Crear cuenta"));

    expect(mockSignUp).toHaveBeenCalledTimes(1);

    // Verify FormData contains tel
    const fd = mockSignUp.mock.calls[0][0] as FormData;
    expect(fd.get("tel")).toBe("+34 612 34 56 78");
    expect(fd.get("nombre")).toBe("Juan");
    expect(fd.get("apellidos")).toBe("Pérez");
    expect(fd.get("email")).toBe("juan@test.com");
  });

  it("sends empty tel when phone is not filled", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText("Registrarse"));

    await user.type(screen.getByPlaceholderText("Nombre"), "Ana");
    await user.type(screen.getByPlaceholderText("Apellidos"), "García");
    await user.type(screen.getByPlaceholderText("tu@email.com"), "ana@test.com");
    await user.type(screen.getByPlaceholderText("Mínimo 6 caracteres"), "secret123");
    await user.type(screen.getByPlaceholderText("Repite la contraseña"), "secret123");

    await user.click(screen.getByText("Crear cuenta"));

    const fd = mockSignUp.mock.calls[0][0] as FormData;
    expect(fd.get("tel")).toBe("");
  });

  it("shows no results message when search has no matches", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText("Registrarse"));

    await user.click(screen.getByText("+34"));
    const searchInput = screen.getByPlaceholderText("Buscar país...");
    await user.type(searchInput, "zzzzzzzzz");

    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
  });

  it("does not show phone field in login mode", async () => {
    render(<LoginPage />);

    // In login mode by default
    expect(screen.queryByText("Teléfono")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/000 00 00 00/)).not.toBeInTheDocument();
  });

  it("shows forgot password link in login mode", async () => {
    render(<LoginPage />);

    // In login mode, should show forgot password link
    expect(screen.getByText("¿Olvidaste tu contraseña?")).toBeInTheDocument();
  });

  it("forgot password link navigates to /login/reset", async () => {
    render(<LoginPage />);

    const link = screen.getByText("¿Olvidaste tu contraseña?");
    expect(link).toHaveAttribute("href", "/login/reset");
  });

  it("does not show forgot password link in register mode", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByText("Registrarse"));

    expect(screen.queryByText("¿Olvidaste tu contraseña?")).not.toBeInTheDocument();
  });
});
