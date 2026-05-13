import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GitMissingDialog } from "./GitMissingDialog";

describe("GitMissingDialog", () => {
  it("renders install instructions", () => {
    render(<GitMissingDialog onRetry={async () => true} />);
    expect(screen.getByText(/需要安裝 Git/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /git-scm\.com/ })).toBeInTheDocument();
  });

  it("calls onRetry on button click", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn().mockResolvedValue(true);
    render(<GitMissingDialog onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: /我已安裝/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows still-missing message when retry returns false", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn().mockResolvedValue(false);
    render(<GitMissingDialog onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: /我已安裝/ }));
    expect(await screen.findByText(/仍未偵測到 Git/)).toBeInTheDocument();
  });
});
