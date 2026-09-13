"use client";
import type { AnalyzeResult } from "@/lib/api";
import { SEUIL_SATURE_DBFS as PIC_MAX, SEUIL_TROP_FAIBLE_DBFS as PIC_MIN } from "@/lib/micro";

/** Seuils appliques par le backend (app/audio/validation.py). */
const DUREE_MIN = 30;
const SILENCE_MAX = 0.35;
const SNR_MIN = 20;

function Mesure({
  libelle,
  valeur,
  unite,
  correcte,
}: {
  libelle: string;
  valeur: string;
  unite: string;
  correcte: boolean;
}) {
  return (
    <div
      className="border-t-2 pt-3"
      style={{ borderColor: correcte ? "var(--signal)" : "var(--brulure)" }}
    >
      <div className="mesure">
        <span
          className="mesure-valeur"
          style={{ fontSize: "1.6rem", color: correcte ? "var(--encre)" : "var(--brulure)" }}
        >
          {valeur}
        </span>
        <span className="mesure-unite">{unite}</span>
      </div>
      <p className="mt-0.5 text-sm text-[var(--estompe)]">{libelle}</p>
    </div>
  );
}

/**
 * Rend les quatre mesures reelles de l'echantillon, pas un simple verdict.
 * L'utilisateur qui se voit refuser doit comprendre laquelle a echoue, sinon
 * il recommence a l'aveugle.
 */
export function QualityReport({ resultat }: { resultat: AnalyzeResult }) {
  const m = resultat.metrics;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Mesure
          libelle="Durée"
          valeur={m.duration_s.toFixed(1)}
          unite="s"
          correcte={m.duration_s >= DUREE_MIN}
        />
        <Mesure
          libelle="Niveau crête"
          valeur={m.peak_dbfs.toFixed(1)}
          unite="dBFS"
          correcte={m.peak_dbfs >= PIC_MIN && m.peak_dbfs <= PIC_MAX}
        />
        <Mesure
          libelle="Silence"
          valeur={Math.round(m.silence_ratio * 100).toString()}
          unite="%"
          correcte={m.silence_ratio <= SILENCE_MAX}
        />
        <Mesure
          libelle="Signal / bruit"
          valeur={m.snr_db.toFixed(1)}
          unite="dB"
          correcte={m.snr_db >= SNR_MIN}
        />
      </div>

      {resultat.ok ? (
        <div className="avis avis-ok">
          Votre voix est exploitable. Vous pouvez la créer.
        </div>
      ) : (
        <div className="avis avis-erreur space-y-1.5">
          {resultat.problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      )}
    </div>
  );
}
