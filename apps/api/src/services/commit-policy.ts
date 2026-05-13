import { git } from "./git.js";

export type CommitTrigger = "create-project" | "save-chapter" | "rename-chapter";

const PREFIX: Record<CommitTrigger, string> = {
  "create-project": "init",
  "save-chapter": "chapter",
  "rename-chapter": "chapter",
};

/**
 * 若 working tree 有變更，git add . && git commit。
 * 無變更回傳 null；commit 失敗 throw Error。
 */
export async function commitIfChanged(
  projectPath: string,
  trigger: CommitTrigger,
  message: string,
): Promise<{ sha: string } | null> {
  const statusResult = await git.status(projectPath);
  if (!statusResult.ok) {
    throw new Error(`git status failed: ${statusResult.error.stderr}`);
  }
  const { staged, unstaged, untracked } = statusResult.value;
  const isClean = staged.length === 0 && unstaged.length === 0 && untracked.length === 0;
  if (isClean) return null;

  const addResult = await git.add(projectPath, ["."]);
  if (!addResult.ok) {
    throw new Error(`git add failed: ${addResult.error.stderr}`);
  }

  const fullMsg = `${PREFIX[trigger]}: ${message}`;
  const commitResult = await git.commit(projectPath, fullMsg);
  if (!commitResult.ok) {
    throw new Error(`git commit failed: ${commitResult.error.stderr}`);
  }
  return commitResult.value;
}
