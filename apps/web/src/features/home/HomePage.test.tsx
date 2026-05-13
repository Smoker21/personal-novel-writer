import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HomePage } from "./HomePage";

describe("HomePage", () => {
  it("renders 新小說 and 瀏覽資料夾 buttons", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /新小說/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /瀏覽資料夾/ })).toBeInTheDocument();
  });

  it("shows empty state when no recent projects", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    // MSW mockSettings has empty recentProjects by default in fixtures
    await waitFor(() => {
      expect(screen.getByText(/尚無最近開啟的專案/)).toBeInTheDocument();
    });
  });
});
