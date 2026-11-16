import type { Submission } from "./memoryStore.ts";

export function reviewBlockers(submission: Submission, decision: "approved" | "rejected"): string[] {
  const blockers: string[] = [];
  if (!/^0x[a-f0-9]{40}$/.test(submission.wallet)) blockers.push("invalid_user");
  if (!submission.video?.complete || !submission.video.sha256 || submission.video.size <= 0) blockers.push("video_missing");
  if (!submission.verification?.completed) blockers.push("verification_incomplete");
  if (submission.status !== "pending_review") blockers.push("not_reviewable");
  if (decision === "approved" && submission.verification?.decision === "rejected") blockers.push("verification_rejected");
  return blockers;
}
