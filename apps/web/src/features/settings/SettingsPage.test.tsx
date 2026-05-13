import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("renders 7 provider cards after MSW load", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Anthropic Claude")).toBeInTheDocument();
    });
    expect(screen.getByText(/Ollama/)).toBeInTheDocument();
    expect(screen.getByText(/xAI/)).toBeInTheDocument();
    expect(screen.getByText(/RWKV Runner/)).toBeInTheDocument();
  });

  it("save button triggers PUT /api/settings and shows confirmation", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => screen.getByText("Anthropic Claude"));
    const saveBtn = screen.getByRole("button", { name: /^儲存$/ });
    await user.click(saveBtn);
    await waitFor(() => expect(screen.getByText("已儲存")).toBeInTheDocument());
  });
});
