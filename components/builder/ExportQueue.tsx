"use client";

import { useBuilder } from "@/lib/store";

/** Floating progress widget for exports running behind the modal. */
export default function ExportQueue() {
  const jobs = useBuilder((s) => s.exportJobs);
  const showModal = useBuilder((s) => s.showExportModal);

  if (showModal || jobs.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-64 space-y-2">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="rounded-lg border border-surface-3 bg-surface-1/95 p-2.5 text-xs shadow-lg backdrop-blur"
        >
          <div className="mb-1 flex justify-between gap-2">
            <span className="truncate text-gray-200">{job.fileName}</span>
            <span className="shrink-0 capitalize text-gray-400">
              {job.stage === "error"
                ? "Failed"
                : job.stage === "done"
                  ? "Done"
                  : `${job.stage} ${job.progress}%`}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className={`h-full rounded-full transition-all ${
                job.stage === "error"
                  ? "bg-red-500"
                  : job.stage === "done"
                    ? "bg-emerald-500"
                    : "bg-accent"
              }`}
              style={{ width: `${job.stage === "done" ? 100 : job.progress}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
