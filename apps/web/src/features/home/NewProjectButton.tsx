import { useState } from "react";
import { useGlobalKey } from "../../lib/keyboard.js";
import { NewProjectDialog } from "../new-project/NewProjectDialog.js";

export function NewProjectButton() {
  const [open, setOpen] = useState(false);
  useGlobalKey("ctrl+n", () => setOpen(true));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-6 py-3 bg-blue-600 text-white rounded text-base font-medium"
      >
        新小說
      </button>
      {open && <NewProjectDialog onClose={() => setOpen(false)} />}
    </>
  );
}
