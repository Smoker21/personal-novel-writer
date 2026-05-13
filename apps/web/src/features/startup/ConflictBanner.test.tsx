import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GitStatus } from "@novel-writer/shared-types";
import { ConflictBanner } from "./ConflictBanner.js";

const cleanStatus: GitStatus = {
  clean: true,
  branch: "main",
  detached: false,
  changes: [],
  ahead: 0,
  behind: 0,
};

const dirtyStatus: GitStatus = {
  clean: false,
  branch: "main",
  detached: false,
  changes: [
    { path: "chapters/c1.md", status: "modified" },
    { path: "characters/anna.md", status: "modified" },
  ],
  ahead: 0,
  behind: 0,
};

describe("ConflictBanner", () => {
  it("renders nothing when status is clean", () => {
    const { container } = render(<ConflictBanner status={cleanStatus} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists changes when not clean", () => {
    render(<ConflictBanner status={dirtyStatus} />);
    expect(screen.getByText(/外部變更已偵測/)).toBeInTheDocument();
    expect(screen.getByText(/2 個檔案/)).toBeInTheDocument();
    expect(screen.getByText(/chapters\/c1\.md/)).toBeInTheDocument();
  });
});
