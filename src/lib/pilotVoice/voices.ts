/**
 * The pilot voice's files: one male Piper voice per app language (all openly
 * licensed: CC0, public domain, M-AILABS or CC-BY-SA), plus the speech engine
 * (ONNX Runtime) and the phonemiser. Languages without a male Piper voice
 * (uk, ja, ko, zh, id, hi) keep the phone's own voice with the radio sound.
 */
export const HF_BASE = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main';
export const ORT_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/';
export const PHONEMIZE_BASE = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';

/** Kept in the Cache API under this name (swept by Burn). */
export const PILOT_CACHE = 'blacktop-pilot-voice';

export interface PilotVoiceDef {
  id: string;
  /** Path of the .onnx under HF_BASE. */
  path: string;
  /** Model size in bytes. */
  bytes: number;
}

const V = (id: string, bytes: number): PilotVoiceDef => {
  const [locale, name, quality] = id.split('-');
  return { id, path: `${locale.split('_')[0]}/${locale}/${name}/${quality}/${id}.onnx`, bytes };
};

export const PILOT_VOICES: Record<string, PilotVoiceDef> = {
  en: V('en_GB-northern_english_male-medium', 63_201_294),
  es: V('es_ES-carlfm-x_low', 28_130_791),
  fr: V('fr_FR-gilles-low', 63_104_526),
  de: V('de_DE-thorsten-low', 63_104_526),
  it: V('it_IT-riccardo-x_low', 28_130_791),
  pt: V('pt_PT-tugão-medium', 63_201_294),
  nl: V('nl_BE-rdh-x_low', 20_628_813),
  pl: V('pl_PL-darkman-medium', 63_201_294),
  sv: V('sv_SE-nst-medium', 63_104_526),
  da: V('da_DK-talesyntese-medium', 63_201_294),
  nb: V('no_NO-talesyntese-medium', 63_201_294),
  tr: V('tr_TR-fahrettin-medium', 63_201_294),
};

/** The engine files every voice needs, with their sizes. */
export const ENGINE_FILES: Array<{ url: string; bytes: number }> = [
  { url: `${ORT_BASE}ort-wasm-simd.wasm`, bytes: 10_595_041 },
  { url: `${PHONEMIZE_BASE}.wasm`, bytes: 635_212 },
  { url: `${PHONEMIZE_BASE}.data`, bytes: 18_077_249 },
];

export function voiceFiles(v: PilotVoiceDef): Array<{ url: string; bytes: number }> {
  return [
    { url: `${HF_BASE}/${v.path}`, bytes: v.bytes },
    { url: `${HF_BASE}/${v.path}.json`, bytes: 5_000 },
  ];
}

export function allFiles(v: PilotVoiceDef) {
  return [...ENGINE_FILES, ...voiceFiles(v)];
}

export function totalBytes(v: PilotVoiceDef): number {
  return allFiles(v).reduce((n, f) => n + f.bytes, 0);
}
