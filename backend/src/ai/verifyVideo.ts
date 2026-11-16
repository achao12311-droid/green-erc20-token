import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export type ModelVerdict = {
  decision: "approved" | "rejected";
  reason: string;
  predictedAction: string | null;
  modelsConfigured: boolean;
  exactDuplicate: boolean;
  nearDuplicate: boolean;
  perceptual: "average_hash" | "not_configured";
  observedLabels: string[];
  frameHashes: string[];
  model: string | null;
};

export const videoDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/videos");

export function verifyVideoFile(filePath: string, action: string, priors: string[]): Promise<ModelVerdict> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "python",
      ["-m", "ai.inference.verify_cli", "--file", filePath, "--action", action, "--priors", priors.join(",")],
      { cwd: repoRoot, env: { ...process.env, PYTHONPATH: repoRoot } },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("model_timeout"));
    }, 120_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || "model_failed"));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as ModelVerdict);
      } catch {
        reject(new Error("model_failed"));
      }
    });
  });
}
