import Link from "next/link";
import { DeleteVoiceButton } from "@/components/DeleteVoiceButton";
import { Onde } from "@/components/Onde";

// Tient en un seul ecran, sans defilement : un titre, une phrase, une action,
// et l'onde calee en bas.
export default function Accueil() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="enveloppe flex flex-1 flex-col justify-center gap-8 py-8 sm:gap-10 sm:py-12">
        <div className="space-y-5 sm:space-y-6">
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

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/onboarding"
            className="group inline-flex w-fit items-center bg-[var(--signal)] px-7 py-4 text-lg font-semibold text-white transition-colors hover:bg-[var(--encre)]"
          >
            Me cloner
          </Link>
          <DeleteVoiceButton />
        </div>
      </div>

      {/* shrink-0 : si le contenu deborde, la page defile plutot que d'ecraser l'onde. */}
      <Onde className="h-20 w-full shrink-0 sm:h-32" />
    </main>
  );
}
