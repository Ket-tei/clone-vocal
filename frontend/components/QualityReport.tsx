"use client";
import type { AnalyzeResult } from "@/lib/api";

export function QualityReport({ resultat }: { resultat: AnalyzeResult }) {
  if (resultat.ok) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
        <p className="font-medium text-emerald-700 dark:text-emerald-400">
          Enregistrement accepté.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Durée {resultat.metrics.duration_s.toFixed(0)} s · rapport signal/bruit{" "}
          {resultat.metrics.snr_db.toFixed(0)} dB
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="font-medium text-amber-700 dark:text-amber-400">
        Il faut refaire l&apos;enregistrement.
      </p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
        {resultat.problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
