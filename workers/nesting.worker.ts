import { requiredSheetHeight, runNest } from "@/lib/nesting/engine";
import type { NestRequest } from "@/lib/nesting/types";

export type WorkerRequest =
  | { kind: "nest"; requestId: number; payload: NestRequest }
  | { kind: "requiredHeight"; requestId: number; payload: NestRequest };

export type WorkerResponse =
  | { kind: "nest"; requestId: number; result: ReturnType<typeof runNest> }
  | { kind: "requiredHeight"; requestId: number; height: number }
  | { kind: "error"; requestId: number; message: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.kind === "nest") {
      const result = runNest(msg.payload);
      const response: WorkerResponse = {
        kind: "nest",
        requestId: msg.requestId,
        result,
      };
      self.postMessage(response);
    } else if (msg.kind === "requiredHeight") {
      const height = requiredSheetHeight(msg.payload);
      const response: WorkerResponse = {
        kind: "requiredHeight",
        requestId: msg.requestId,
        height,
      };
      self.postMessage(response);
    }
  } catch (err) {
    const response: WorkerResponse = {
      kind: "error",
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : "Nesting failed",
    };
    self.postMessage(response);
  }
};
