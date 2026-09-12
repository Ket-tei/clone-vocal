"use client";
import { useEffect, useRef, useState } from "react";
import { rmsToDbfs } from "@/lib/audio";

// Seuils reels appliques par le backend (app/audio/validation.py).
const PLANCHER_DBFS = -60;
const TROP_FAIBLE = -18;
const SATURE = -1;

const enPourcent = (dbfs: number) =>
  Math.max(0, Math.min(100, ((dbfs - PLANCHER_DBFS) / -PLANCHER_DBFS) * 100));

/**
 * Le vumetre est l'element central du produit : c'est lui qui dit a
 * l'utilisateur si son enregistrement sera accepte. Il est donc traite en
 * grand, avec les deux seuils du backend dessines a leur place exacte, et
 * non comme une barre de progression decorative.
 */
export function MicLevelMeter({ stream }: { stream: MediaStream | null }) {
  const [dbfs, setDbfs] = useState(PLANCHER_DBFS);
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

  const sature = dbfs >= SATURE;
  const faible = dbfs <= TROP_FAIBLE;
  const teinte = sature ? "var(--brulure)" : faible ? "var(--signal)" : "var(--eclat)";
  const conseil = sature
    ? "Trop fort. Éloignez-vous du micro."
    : faible
      ? "Trop faible. Rapprochez-vous du micro."
      : "Niveau correct.";

  return (
    <div className="space-y-4">
      <div className="vumetre" role="meter" aria-valuenow={Math.round(dbfs)} aria-valuemin={-60} aria-valuemax={0} aria-label="Niveau du micro">
        <div
          className="vumetre-jauge"
          style={{ background: teinte, transform: `scaleX(${enPourcent(dbfs) / 100})` }}
        />
        <span className="vumetre-seuil" style={{ left: `${enPourcent(TROP_FAIBLE)}%` }} />
        <span className="vumetre-seuil" style={{ left: `${enPourcent(SATURE)}%` }} />
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="mesure">
          <span className="mesure-valeur" style={{ color: teinte }}>
            {dbfs <= PLANCHER_DBFS ? "—" : Math.round(dbfs)}
          </span>
          <span className="mesure-unite">dBFS</span>
        </div>
        <p className="max-w-[22ch] text-right text-[0.95rem] font-medium leading-snug">
          {conseil}
        </p>
      </div>
    </div>
  );
}
