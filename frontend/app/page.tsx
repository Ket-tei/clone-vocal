import Link from "next/link";
import { DeleteVoiceButton } from "@/components/DeleteVoiceButton";
import { Onde } from "@/components/Onde";

export default function Accueil() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="enveloppe flex flex-1 flex-col justify-center gap-10 py-16">
        <div className="space-y-6">
          <h1 className="titre-geant">
            45 secondes
            <br />
            de votre voix
          </h1>
          <p className="sous-titre">
            Lisez un court texte à voix haute. Ensuite, votre voix présente votre
            offre et répond aux questions de vos prospects.
          </p>
        </div>

        <Link
          href="/onboarding"
          className="group inline-flex w-fit items-center bg-[var(--signal)] px-7 py-4 text-lg font-semibold text-white transition-colors hover:bg-[var(--encre)]"
        >
          Me cloner
        </Link>
      </div>

      {/* L'onde occupe toute la largeur : c'est la matiere du produit, et elle
          enseigne la regle de qualite avant meme le premier enregistrement. */}
      <Onde className="h-24 w-full sm:h-32" />

      <div className="enveloppe space-y-6 py-10">
        <dl className="grid gap-x-8 gap-y-5 text-[0.95rem] sm:grid-cols-3">
          <div className="border-t-2 border-[var(--signal)] pt-3">
            <dt className="font-semibold">Trop faible</dt>
            <dd className="text-[var(--estompe)]">
              En dessous de −18 dBFS, le clonage manque de matière.
            </dd>
          </div>
          <div className="border-t-2 border-[var(--eclat)] pt-3">
            <dt className="font-semibold">Correct</dt>
            <dd className="text-[var(--estompe)]">
              La zone à viser. Parlez à distance normale du micro.
            </dd>
          </div>
          <div className="border-t-2 border-[var(--brulure)] pt-3">
            <dt className="font-semibold">Saturé</dt>
            <dd className="text-[var(--estompe)]">
              Au dessus de −1 dBFS, le son est écrêté et inexploitable.
            </dd>
          </div>
        </dl>
      </div>

      <div className="bande-signal">
        <div className="enveloppe flex flex-wrap items-center justify-between gap-4 py-6">
          <p className="max-w-[40ch] text-[0.95rem] leading-relaxed">
            Votre voix reste sur cette machine. Aucun enregistrement n&apos;est
            envoyé à un service extérieur.
          </p>
          <DeleteVoiceButton />
        </div>
      </div>
    </main>
  );
}
