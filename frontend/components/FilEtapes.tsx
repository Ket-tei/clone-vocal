/**
 * Fil d'etapes : un trait qui se remplit. Des pastilles numerotees
 * suggereraient un formulaire administratif ; ici c'est une prise de son.
 *
 * Au survol, chaque trait s'agrandit vers le bas et affiche le nom de son
 * etape. Une etape deja franchie est un bouton qui y ramene. A chaque
 * nouvelle etape, tous les traits se deplient une seconde puis se replient.
 */
export function FilEtapes({
  noms,
  rang,
  surRetour,
  bloque = false,
}: {
  noms: readonly string[];
  rang: number;
  surRetour: (indice: number) => void;
  bloque?: boolean;
}) {
  return (
    // La cle remonte le fil a chaque etape, ce qui relance son animation d'annonce.
    <ol key={rang} className="fil fil-annonce" aria-label={`Étape ${rang + 1} sur ${noms.length}`}>
      {noms.map((nom, i) => {
        const segment = (
          <span className="fil-segment" data-fait={i <= rang ? "oui" : "non"}>
            <span className="fil-nom">{nom}</span>
          </span>
        );
        return (
          <li key={nom} className="fil-etape" aria-current={i === rang ? "step" : undefined}>
            {i < rang ? (
              <button
                type="button"
                className="fil-cible"
                onClick={() => surRetour(i)}
                disabled={bloque}
                aria-label={`Revenir à l'étape ${nom}`}
              >
                {segment}
              </button>
            ) : (
              <span className="fil-cible">{segment}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
