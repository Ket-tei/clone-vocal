"use client";
import { useEffect, useRef, useState } from "react";
import { rmsToDbfs } from "@/lib/audio";

export function MicLevelMeter({ stream }: { stream: MediaStream | null }) {
  const [dbfs, setDbfs] = useState(-60);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const tampon = new Float32Array(analyser.fftSize);

    const boucle = () => {
      analyser.getFloatTimeDomainData(tampon);
      let somme = 0;
      for (const v of tampon) somme += v * v;
      setDbfs(rmsToDbfs(Math.sqrt(somme / tampon.length)));
      frame.current = requestAnimationFrame(boucle);
    };
    boucle();
    return () => {
      cancelAnimationFrame(frame.current);
      void ctx.close();
    };
  }, [stream]);

  const pourcent = Math.max(0, Math.min(100, ((dbfs + 60) / 60) * 100));
  const correct = dbfs > -18 && dbfs < -1;

  return (
    <div className="space-y-2">
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-[width] duration-75 ${
            correct ? "bg-emerald-500" : dbfs >= -1 ? "bg-red-500" : "bg-amber-500"
          }`}
          style={{ width: `${pourcent}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {dbfs >= -1
          ? "Trop fort : éloignez-vous du micro."
          : dbfs <= -18
            ? "Trop faible : rapprochez-vous du micro."
            : "Niveau correct, vous pouvez enregistrer."}
      </p>
    </div>
  );
}
