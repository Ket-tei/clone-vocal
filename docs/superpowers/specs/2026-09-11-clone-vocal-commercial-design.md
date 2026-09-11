# Clone vocal commercial — design (phase 1)

**Date :** 2026-09-11
**Statut :** validé en brainstorming, en attente de relecture
**Phase :** 1 sur 2 — voix seule, hors ligne, non connectée à la visio

---

## 1. Objectif

Une application web exécutée entièrement en local — ouverte dans le navigateur sur `localhost`, sans aucun hébergement distant — qui clone la voix de l'utilisateur, reçoit le contexte d'un rendez-vous commercial, délivre une présentation avec cette voix, puis répond aux questions posées au micro.

Le navigateur est retenu pour l'accès micro et la qualité d'interface ; l'empaquetage en application de bureau (Tauri) est hors périmètre phase 1 et n'est pas exclu ensuite.

**Critère de succès :** prouver la crédibilité. À l'écoute, un tiers doit hésiter entre l'enregistrement réel et la voix synthétisée. Le réalisme prime sur la latence.

**Hors périmètre phase 1 :** le visage et les expressions, l'intégration Google Meet et Teams, tout envoi réseau sortant.

**Phase 2 (documentée, non planifiée) :** branchement visio avec contexte prospect. Deux sujets à rouvrir à ce moment-là et à ne pas traiter ici : l'obligation d'information de l'AI Act européen (art. 50) dès qu'un tiers parle à une IA, et le fait qu'un LLM non filtré s'exprimant avec la voix de l'utilisateur peut engager l'entreprise sur un prix ou un contrat.

---

## 2. Contraintes

| Contrainte | Valeur | Origine |
|---|---|---|
| Hébergement | Intégralement local | Confidentialité : la voix est une donnée biométrique irrécupérable une fois diffusée |
| Réseau | Aucun appel sortant en fonctionnement | Idem |
| GPU cible | NVIDIA 8-12 Go VRAM | Machine de l'utilisateur (RTX 3060/4060/4070) |
| Langue | Français | Utilisateur et prospects francophones |
| Interaction | Tour par tour | Choix assumé : le temps réel n'est pas requis en phase 1 |
| Licences | Réutilisables commercialement | `buisness_vision` a vocation à devenir un produit |

La machine de développement principale (i7-1250U, Iris Xe, sans GPU) et le VPS Hostinger (1 vCPU, 3,8 Go RAM, sans GPU) **ne peuvent pas** exécuter l'inférence. Le développement de l'interface peut s'y faire ; l'exécution complète exige la machine à GPU.

---

## 3. Architecture

Deux composants écrits, trois configurés.

```
┌───────────────────────────────────────────────────────┐
│  FRONTEND — Next.js + Tailwind + shadcn/ui            │  écrit
│  Onboarding · Brief · Présentation · Boucle Q/R       │
└───────────────────────────┬───────────────────────────┘
                            │ HTTP + WebSocket
┌───────────────────────────▼───────────────────────────┐
│  BACKEND — FastAPI (Python)                           │  écrit
│  Orchestration · héberge le TTS en process            │
└─────┬─────────────────────┬───────────────────────┬───┘
      │ WebSocket           │ HTTP                  │ in-process
┌─────▼──────┐      ┌───────▼────────┐      ┌───────▼────────┐
│ moshi-srv  │      │    Ollama      │      │  Chatterbox    │  configuré
│ STT Kyutai │      │  LLM local     │      │  TTS clonant   │
└────────────┘      └────────────────┘      └────────────────┘
```

**Décisions structurantes**

- **Backend en Python.** Chatterbox est une bibliothèque, pas un serveur. Le backend l'héberge en process : une dépendance et un aller-retour réseau en moins sur le chemin critique.
- **Ollama pour le LLM.** Il charge et décharge les modèles seul. En tour par tour, STT et TTS restent résidents (~6 Go) et le LLM se charge à la demande ; les trois ne sont jamais actifs simultanément.
- **STT Kyutai `stt-1b-en_fr`.** Bilingue français, 0,5 s de latence, détection d'activité vocale sémantique, poids CC-BY 4.0, auto-hébergeable via `moshi-server`.
- **Chatterbox par défaut pour le TTS** (Resemble AI, licence MIT, donc commercialement réutilisable). OpenVoice V2 (MIT également) est l'alternative retenue si le rendu déçoit sur la voix de l'utilisateur. XTTS v2 et F5-TTS sont écartés : licences non commerciales.

**Ce qui vient d'InvincibleVoice :** l'inspiration architecturale STT→LLM→TTS et le choix du STT Kyutai. Son TTS est explicitement incapable de cloner une voix arbitraire — restriction volontaire de Kyutai — donc le clonage vient de Chatterbox. Le projet n'est pas un fork.

---

## 4. Composants

| Unité | Rôle | Dépend de |
|---|---|---|
| `voice-capture` | Enregistre la voix, valide la qualité, produit un profil vocal | micro navigateur |
| `voice-store` | Stocke profils et échantillons, gère la suppression | SQLite + disque |
| `brief` | Formulaire de contexte prospect → objet `MeetingBrief` | — |
| `script-gen` | `MeetingBrief` → présentation structurée en blocs | Ollama |
| `speech` | (texte, profil vocal) → audio, en streaming par phrase | Chatterbox |
| `qa-loop` | Question → réponse en streaming → audio | Ollama + STT + `speech` |
| `capability-probe` | Mesure la VRAM au démarrage, choisit le palier de modèles | nvidia-ml |

**Frontières.** `speech` ignore tout du contexte prospect. `script-gen` ignore tout de l'audio. Remplacer Chatterbox par OpenVoice V2 ne touche que `speech`.

---

## 5. Parcours utilisateur

### Onboarding — une fois, environ 3 minutes

1. **Accueil.** Ce que fait l'application, et une phrase explicite : rien ne quitte cette machine.
2. **Test micro.** Niveau visualisé en direct, bruit de fond mesuré avant tout enregistrement.
3. **Lecture.** Un script français phonétiquement riche, environ 45 secondes, affiché en grand et défilant.
4. **Contrôle qualité automatique.** Durée, niveau crête, proportion de silence, rapport signal/bruit. En cas d'échec : la raison précise est affichée et l'enregistrement est refait. Un échantillon médiocre n'est jamais accepté — toute la crédibilité en aval en dépend.
5. **Validation à l'oreille.** La voix clonée prononce une phrase qui n'a pas été enregistrée. L'utilisateur garde ou recommence.

### Par réunion

```
Brief prospect ──► script-gen ──► script en blocs ──► speech ──► présentation audio
                                        │
                                        ▼
     question (micro ──► STT) ──► qa-loop ──► réponse en streaming ──► speech
                                        ▲                                 │
                                        └────────── historique ───────────┘
```

Le `MeetingBrief` et le script restent dans le contexte du LLM pendant toute la boucle : les réponses demeurent cohérentes avec ce qui a été présenté.

### Boucle question/réponse

Flux direct, sans étape de sélection. Le LLM répond comme un assistant classique, la voix clonée prononce.

**Le streaming est obligatoire, pas optionnel.** Sans étape de sélection, plus rien ne masque le temps de génération : l'utilisateur attend en silence. Dès que le LLM termine sa première phrase, celle-ci part au TTS et la lecture commence pendant que la suite se génère.

- Cible : premiers mots audibles en 1 à 2 secondes.
- Sans streaming : 5 à 8 secondes de silence. Inacceptable.
- Le texte s'affiche à mesure que la voix parle.
- L'utilisateur peut interrompre la lecture à tout moment.

---

## 6. Modèle de données

```
VoiceProfile
  id, label, created_at
  sample_path           # WAV de référence sur disque
  sample_duration_s, snr_db, peak_dbfs
  engine                # "chatterbox" | "openvoice_v2"

MeetingBrief
  id, created_at
  prospect_name, company, role
  stake                 # enjeu du prospect
  goal                  # objectif du rendez-vous
  expected_objections[]
  tone                  # registre souhaité
  target_duration_min

Script
  id, brief_id
  blocks[]              # {kind: accroche|probleme|solution|preuve|next_step, text}

Session
  id, brief_id, voice_profile_id, started_at
  turns[]               # {role: user|assistant, text, audio_path, latency_ms}
```

Persistance SQLite, fichiers audio sur disque à côté. Aucun service externe.

---

## 7. Confidentialité

L'auto-hébergement est motivé par la confidentialité : ces points sont des exigences, pas des détails d'implémentation.

- Aucun appel réseau sortant en fonctionnement nominal. Un test automatisé le vérifie.
- Échantillons et profils sur disque local, chemin affiché dans l'interface.
- Bouton **« supprimer ma voix »** : efface réellement échantillons, profil et sessions liées.
- Les briefs prospects — noms, montants, enjeux — ne transitent que par le LLM local.
- Le téléchargement initial des poids de modèles est la seule exception, documentée comme telle et effectuée à l'installation.

---

## 8. Gestion d'erreurs

| Situation | Comportement |
|---|---|
| Micro refusé ou absent | Écran dédié avec la marche à suivre par navigateur, pas une notification fugace |
| Échantillon trop court, saturé ou bruité | Refus explicite, raison précise, nouvel essai |
| Service d'inférence éteint | Bandeau nommant le service et la commande pour le relancer. Jamais de chargement infini |
| VRAM insuffisante | Détectée au démarrage par `capability-probe`, qui refuse une configuration intenable plutôt que de planter en cours de démonstration |
| Réponse LLM hors-sujet | Bouton de régénération |
| TTS en échec sur un bloc | Le bloc est signalé, la lecture continue, le texte reste affiché |

**Paliers de `capability-probe`** — résout la taille du LLM sans connaître la carte exacte :

| VRAM détectée | LLM retenu | Total estimé |
|---|---|---|
| ≥ 12 Go | Qwen3 8B ou Mistral Nemo 12B, Q4 | ~11 Go |
| 8 à 12 Go | Qwen3 4B, Q4 | ~9 Go |
| < 8 Go | Refus au démarrage, message explicite | — |

---

## 9. Tests

L'essentiel doit être testable sans GPU : l'intégration continue ne doit jamais exiger une carte NVIDIA.

**Unitaires (sans GPU)**
- Validation audio : durée, crête, proportion de silence, SNR, cas limites.
- Parsing et validation du `MeetingBrief`.
- Découpage du script en blocs typés.
- Découpage d'un flux de tokens en phrases prononçables — y compris abréviations, nombres et ponctuation française.
- Construction des prompts : le brief et le script sont bien injectés.

**Intégration**
- Test de fumée : STT, Ollama et Chatterbox répondent. Doublures utilisées quand les services sont absents.
- Test de confidentialité : aucune connexion sortante pendant une session complète.

**Qualité vocale — non automatisable**

Protocole d'écoute écrit, exécuté par l'utilisateur, pour trancher Chatterbox contre OpenVoice V2 sur sa propre voix plutôt que sur des démonstrations anglaises :
- 5 phrases types : une salutation, un argumentaire chiffré, une réponse à objection, une question, une phrase longue.
- Notation sur deux axes, ressemblance et naturel, de 1 à 5.
- Comparaison en aveugle avec un enregistrement réel de la même phrase.
- Seuil retenu pour « crédible » : ressemblance ≥ 4 en moyenne, et hésitation réelle lors du test en aveugle.

---

## 10. Décisions ouvertes

Aucune ne bloque le plan d'implémentation ; toutes ont une valeur par défaut.

| Sujet | Défaut retenu | Levée par |
|---|---|---|
| Référence exacte du GPU | `capability-probe` choisit le palier à l'exécution | Premier lancement sur la machine à GPU |
| Chatterbox contre OpenVoice V2 | Chatterbox | Protocole d'écoute de la section 9 |
| Modèle LLM précis | Qwen3 selon palier | Essai en français sur des briefs réels |

---

## 11. Ce que la phase 1 ne fait pas

Énoncé pour éviter toute dérive de périmètre : pas de visage ni d'expressions, pas de connexion Meet ou Teams, pas de temps réel avec interruption à la volée, pas de multi-utilisateurs, pas d'import CRM, pas de déploiement distant.
