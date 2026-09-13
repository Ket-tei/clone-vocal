"use client";
import { useEffect, useRef, useState } from "react";
import {
  SEUIL_SATURE_DBFS as SATURE,
  SEUIL_TROP_FAIBLE_DBFS as TROP_FAIBLE,
  niveauCrete,
  relacher,
} from "@/lib/micro";

// Les seuils sont ceux du backend (app/audio/validation.py). Il les compare a
// la crete de l'enregistrement : le vumetre mesure donc la crete.
const PLANCHER_DBFS = -60;

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
    // Cree apres l'autorisation du micro, donc hors du clic : certains
    // navigateurs le laissent alors suspendu, et l'analyseur ne rend que du silence.
    if (ctx.state === "suspended") void ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const tampon = new Float32Array(analyser.fftSize);
    let affiche = PLANCHER_DBFS;
    let precedent = performance.now();

    const boucle = (maintenant: number) => {
      analyser.getFloatTimeDomainData(tampon);
      const dtS = Math.max(0, (maintenant - precedent) / 1000);
      precedent = maintenant;
      affiche = relacher(affiche, niveauCrete(tampon), dtS);
      setDbfs(affiche);
      frame.current = requestAnimationFrame(boucle);
    };
    frame.current = requestAnimationFrame(boucle);
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
