"use client";

import type {
  WorkerRequest,
  WorkerResponse,
} from "@/workers/nesting.worker";
import type { NestRequest, NestResult } from "./types";

interface Pending {
  resolve: (msg: WorkerResponse) => void;
  reject: (err: Error) => void;
}

let worker: Worker | null = null;
const pending = new Map<number, Pending>();
let seq = 0;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../../workers/nesting.worker.ts", import.meta.url));
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const p = pending.get(e.data.requestId);
    if (!p) return;
    pending.delete(e.data.requestId);
    if (e.data.kind === "error") p.reject(new Error(e.data.message));
    else p.resolve(e.data);
  };
  worker.onerror = () => {
    pending.forEach((p) => p.reject(new Error("Nesting worker crashed")));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function call(
  kind: WorkerRequest["kind"],
  payload: NestRequest
): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const requestId = ++seq;
    pending.set(requestId, { resolve, reject });
    ensureWorker().postMessage({ kind, requestId, payload } satisfies WorkerRequest);
  });
}

/** Nest off the main thread; degrades to a main-thread run if workers fail. */
export async function nestInWorker(request: NestRequest): Promise<NestResult> {
  try {
    const res = await call("nest", request);
    if (res.kind !== "nest") throw new Error("Unexpected worker reply");
    return res.result;
  } catch {
    const { runNest } = await import("./engine");
    return runNest(request);
  }
}

/** Sheet height needed (fixed width) to fit every item in the request. */
export async function requiredHeightInWorker(
  request: NestRequest
): Promise<number> {
  try {
    const res = await call("requiredHeight", request);
    if (res.kind !== "requiredHeight") throw new Error("Unexpected worker reply");
    return res.height;
  } catch {
    const { requiredSheetHeight } = await import("./engine");
    return requiredSheetHeight(request);
  }
}
