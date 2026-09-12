export const SCRIPT_LECTURE = `
Bonjour, je m'appelle et je travaille depuis maintenant plusieurs années dans
l'accompagnement des entreprises. Mon quotidien consiste à comprendre un besoin,
puis à construire une réponse concrète avec mes clients. Quand un dossier avance
bien, nous bouclons en moins de trois semaines, parfois en 15 jours seulement.
Ce matin, j'ai reçu un appel important au sujet d'un contrat de 24 000 euros.
La discussion portait sur un point sensible : le délai de déploiement. J'ai
expliqué calmement notre méthode, en montrant chaque étape, sans rien enjoliver.
Un bon échange commence toujours par une écoute attentive, un ton posé, et
beaucoup d'honnêteté. Merci d'avoir pris ce temps ; je vous propose que nous
avancions ensemble sur la suite.
`.trim();

export function rmsToDbfs(rms: number): number {
  return 20 * Math.log10(Math.max(rms, 1e-10));
}

export const TAUX_CIBLE = 24000;

/** Encode du PCM flottant en WAV mono 16 bits. libsndfile ne lit pas le WebM. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const tampon = new ArrayBuffer(44 + samples.length * 2);
  const vue = new DataView(tampon);
  const texte = (offset: number, valeur: string) => {
    for (let i = 0; i < valeur.length; i++) vue.setUint8(offset + i, valeur.charCodeAt(i));
  };

  texte(0, "RIFF");
  vue.setUint32(4, 36 + samples.length * 2, true);
  texte(8, "WAVE");
  texte(12, "fmt ");
  vue.setUint32(16, 16, true); // taille du bloc fmt
  vue.setUint16(20, 1, true); // PCM entier
  vue.setUint16(22, 1, true); // mono
  vue.setUint32(24, sampleRate, true);
  vue.setUint32(28, sampleRate * 2, true); // octets par seconde
  vue.setUint16(32, 2, true); // alignement de bloc
  vue.setUint16(34, 16, true); // bits par echantillon
  texte(36, "data");
  vue.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const borne = Math.max(-1, Math.min(1, samples[i]));
    vue.setInt16(44 + i * 2, borne < 0 ? borne * 0x8000 : borne * 0x7fff, true);
  }
  return new Blob([tampon], { type: "audio/wav" });
}

/**
 * Convertit l'enregistrement WebM de MediaRecorder en WAV 24 kHz mono.
 * Le navigateur decode nativement son propre WebM ; creer le contexte a la
 * frequence cible fait le reechantillonnage au passage.
 */
export async function webmToWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext({ sampleRate: TAUX_CIBLE });
  try {
    const decode = await ctx.decodeAudioData(await blob.arrayBuffer());
    return encodeWav(decode.getChannelData(0), decode.sampleRate);
  } finally {
    void ctx.close();
  }
}

/** Lit des extraits audio strictement dans l'ordre d'arrivee. */
export class AudioQueue {
  private file: Blob[] = [];
  private courant: HTMLAudioElement | null = null;
  private actif = false;

  get isPlaying(): boolean {
    return this.actif;
  }

  push(blob: Blob): void {
    this.file.push(blob);
    if (!this.actif) void this.suivant();
  }

  private async suivant(): Promise<void> {
    const blob = this.file.shift();
    if (!blob) {
      this.actif = false;
      return;
    }
    this.actif = true;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.courant = audio;
    audio.onended = audio.onerror = () => {
      URL.revokeObjectURL(url);
      void this.suivant();
    };
    await audio.play().catch(() => {
      URL.revokeObjectURL(url);
      void this.suivant();
    });
  }

  stop(): void {
    this.file = [];
    this.courant?.pause();
    this.courant = null;
    this.actif = false;
  }
}
