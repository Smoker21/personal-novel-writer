import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { NewProjectDialog } from "./NewProjectDialog";

describe("NewProjectDialog", () => {
  it("starts on step 1 with title and folder fields", () => {
    render(
      <MemoryRouter>
        <NewProjectDialog onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/步驟 1 \/ 3/)).toBeInTheDocument();
    expect(screen.getByText(/書名/)).toBeInTheDocument();
    expect(screen.getByText(/父資料夾/)).toBeInTheDocument();
  });

  it("disables next button when step 1 incomplete", () => {
    render(
      <MemoryRouter>
        <NewProjectDialog onClose={() => {}} />
      </MemoryRouter>,
    );
    const next = screen.getByRole("button", { name: /下一步/ });
    expect(next).toBeDisabled();
  });

  it("close button calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <NewProjectDialog onClose={onClose} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
