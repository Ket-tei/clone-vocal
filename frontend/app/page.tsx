import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Accueil() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">
          Votre voix, pour vos rendez-vous
        </h1>
        <p className="text-lg text-muted-foreground">
          Clonez votre voix une fois, décrivez votre prochain rendez-vous, et
          entraînez-vous à répondre aux questions de votre prospect.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Tout reste sur cette machine.</p>
        <p className="mt-1 text-muted-foreground">
          Votre voix, vos enregistrements et le contexte de vos prospects ne sont
          envoyés à aucun service externe. Aucune connexion sortante n&apos;est
          effectuée pendant l&apos;utilisation.
        </p>
      </div>

      <Button render={<Link href="/onboarding" />} size="lg" className="self-start">
        Cloner ma voix
      </Button>
    </main>
  );
}
