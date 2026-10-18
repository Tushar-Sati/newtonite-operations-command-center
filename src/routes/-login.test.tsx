import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { LoginPageForTest } from "./login";

const { loginMock } = vi.hoisted(() => ({ loginMock: vi.fn() }));
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => ({ user: null, login: loginMock }) }));

describe("login experience", () => {
  beforeEach(() => { loginMock.mockReset(); });

  it("submits credentials through authentication and shows a pending state", async () => {
    let resolveLogin!: () => void;
    loginMock.mockImplementation(() => new Promise<void>((resolve) => { resolveLogin = resolve; }));
    render(<LoginPageForTest />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "member@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-password" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in securely/i }));
    expect(await screen.findByText("Verifying credentials…")).toBeInTheDocument();
    expect(loginMock).toHaveBeenCalledWith("member@example.com", "correct-password");
    resolveLogin();
    await waitFor(() => expect(screen.getByRole("button", { name: /sign in securely/i })).toBeEnabled());
  });

  it("renders backend authentication errors inline", async () => {
    loginMock.mockRejectedValue(new ApiError("Invalid email or password", 401, "invalid_credentials"));
    render(<LoginPageForTest />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "viewer@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in securely/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
  });

  it("supports a keyboard accessible password visibility toggle and marks demonstration data", () => {
    render(<LoginPageForTest />);
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("DEMONSTRATION SNAPSHOT")).toBeInTheDocument();
    expect(screen.getByText("DEVELOPMENT ONLY")).toBeInTheDocument();
  });
});
