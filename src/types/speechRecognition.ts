export type SpeechRecognitionEventLike =
  Event & {
    resultIndex: number;
    results: SpeechRecognitionResultList;
  };

export type SpeechRecognitionErrorEventLike =
  Event & {
    error: string;
  };

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;

  start: () => void;
  stop: () => void;
  abort: () => void;

  onstart:
    | (() => void)
    | null;

  onresult:
    | ((event: SpeechRecognitionEventLike) => void)
    | null;

  onerror:
    | ((event: SpeechRecognitionErrorEventLike) => void)
    | null;

  onend:
    | (() => void)
    | null;
};

export type SpeechRecognitionConstructor =
  new () => SpeechRecognitionLike;

/*
 * Keep this separate from the native Window type.
 * This prevents TypeScript from merging incompatible
 * browser SpeechRecognition declarations.
 */
export type SpeechRecognitionWindow = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};