/**
 * M5 TD-9: FirstLaunchWarningDialog 鎖 ESC + click-outside 行為驗證
 */
import { defaultSettings } from "@novel-writer/shared-types";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FirstLaunchWarningDialog } from "./FirstLaunchWarningDialog";

function mockFetchSettings(acknowledged: boolean) {
  global.fetch = vi.fn(async (url) => {
    if (String(url).endsWith("/api/settings")) {
      const s = { ...defaultSettings(), meta: { firstLaunchWarningAcknowledged: acknowledged } };
      return new Response(JSON.stringify(s), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("FirstLaunchWarningDialog — M5 TD-9 modality", () => {
  beforeEach(() => {
    mockFetchSettings(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders dialog when not yet acknowledged", async () => {
    render(<FirstLaunchWarningDialog />);
    await waitFor(() => {
      expect(screen.getByText("使用前須知")).toBeInTheDocument();
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("ESC key does NOT close the dialog (M5 TD-9)", async () => {
    const user = userEvent.setup();
    render(<FirstLaunchWarningDialog />);
    await waitFor(() => screen.getByText("使用前須知"));

    await user.keyboard("{Escape}");

    // Dialog should still be visible
    expect(screen.getByText("使用前須知")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("clicking backdrop does NOT close the dialog (M5 TD-9)", async () => {
    const user = userEvent.setup();
    render(<FirstLaunchWarningDialog />);
    await waitFor(() => screen.getByText("使用前須知"));

    // Click on the backdrop element directly
    const dialog = screen.getByRole("dialog");
    await user.click(dialog);

    // Dialog should still be visible
    expect(screen.getByText("使用前須知")).toBeInTheDocument();
  });

  it("does not render when already acknowledged", async () => {
    mockFetchSettings(true);
    const { container } = render(<FirstLaunchWarningDialog />);
    // Give effect a chance to run
    await new Promise((r) => setTimeout(r, 50));
    expect(container.firstChild).toBeNull();
  });
});
