"use client";
import { useEffect, useRef, useState } from "react";
import {
  PLANCHER_JAUGE_DBFS,
  SEUIL_SATURE_DBFS,
  SEUIL_TROP_FAIBLE_DBFS,
  niveauCrete,
  positionJauge,
  relacher,
  zoneNiveau,
  type ZoneNiveau,
} from "@/lib/micro";

// La couleur dit ou en est le signal : jaune tant que c'est trop faible, bleu
// dans la bonne plage, rouge quand ca sature.
const TEINTE: Record<ZoneNiveau, string> = {
  faible: "var(--eclat)",
  correct: "var(--signal)",
  sature: "var(--brulure)",
};

const CONSEIL: Record<ZoneNiveau, string> = {
  faible: "Trop faible. Rapprochez-vous du micro.",
  correct: "Niveau correct.",
  sature: "Trop fort. Éloignez-vous du micro.",
};

/**
 * Le vumetre est l'element central du produit : c'est lui qui dit a
 * l'utilisateur si son enregistrement sera accepte. Il mesure la crete, comme
 * le controle qualite du backend, et ses deux reperes sont les seuils du
 * backend, places pour que la bonne plage occupe le centre de la jauge.
 */
export function MicLevelMeter({ stream }: { stream: MediaStream | null }) {
  const [dbfs, setDbfs] = useState(PLANCHER_JAUGE_DBFS);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    // Cree apres l'autorisation du micro, donc hors du clic : certains
    // navigateurs le laissent alors suspendu, et l'analyseur ne rend que du silence.
    // resume() est rejetee si le contexte est ferme avant d'avoir repris : c'est
    // le cas normal quand le composant est demonte aussitot (Strict Mode en
    // developpement, changement d'etape). Non interceptee, cette promesse
    // remontait en erreur « Closed before resume completed ».
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const tampon = new Float32Array(analyser.fftSize);
    let affiche = PLANCHER_JAUGE_DBFS;
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
      if (ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, [stream]);

  const zone = zoneNiveau(dbfs);

  return (
    <div className="space-y-4">
      <div
        className="vumetre"
        role="meter"
        aria-valuenow={Math.round(dbfs)}
        aria-valuemin={PLANCHER_JAUGE_DBFS}
        aria-valuemax={0}
        aria-label="Niveau du micro"
      >
        <div
          className="vumetre-jauge"
          style={{ background: TEINTE[zone], transform: `scaleX(${positionJauge(dbfs) / 100})` }}
        />
        <span className="vumetre-seuil" style={{ left: `${positionJauge(SEUIL_TROP_FAIBLE_DBFS)}%` }} />
        <span className="vumetre-seuil" style={{ left: `${positionJauge(SEUIL_SATURE_DBFS)}%` }} />
      </div>

      {/* Dimensions fixes : le conseil passe d'une a deux lignes et le chiffre
          change de largeur selon la zone. Sans elles, la hauteur du bloc varie
          et toute l'etape, centree verticalement, sautille pendant qu'on parle. */}
      <div className="flex items-end justify-between gap-4">
        <div className="mesure shrink-0">
          {/* Toujours en encre : un chiffre jaune sur le papier serait illisible. */}
          <span className="mesure-valeur inline-block min-w-[3ch]">
            {dbfs <= PLANCHER_JAUGE_DBFS ? "—" : Math.round(dbfs)}
          </span>
          <span className="mesure-unite">dBFS</span>
        </div>
        <p className="flex min-h-[2.75em] w-[22ch] min-w-0 flex-col justify-end text-right text-[0.95rem] font-medium leading-snug">
          {CONSEIL[zone]}
        </p>
      </div>
    </div>
  );
}
