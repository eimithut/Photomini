
export interface FilterState {
  brightness: number; // 100 is default
  contrast: number;   // 100 is default
  saturation: number; // 100 is default
  grayscale: number;  // 0 is default
  sepia: number;      // 0 is default
  blur: number;       // 0 is default
  rotation: number;   // 0, 90, 180, 270
}

export const DEFAULT_FILTERS: FilterState = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  blur: 0,
  rotation: 0,
};

export interface EditorHistory {
  past: string[];
  present: string | null;
  future: string[];
}

export type ManualToolType = 'brush' | 'blur' | 'pixelate' | 'eraser' | 'censor' | 'lighten' | 'darken' | 'tint' | 'desaturate' | 'invert';

export interface BrushSettings {
  size: number;
  color: string;
  intensity: number; // For blur strength or pixelation size
}

export const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  size: 20,
  color: '#f59e0b', // default yellow
  intensity: 10,
};

// Face Detection Types
export interface FaceDetection {
  boundingBox: {
    originX: number;
    originY: number;
    width: number;
    height: number;
  };
  landmarks: { x: number; y: number }[]; // 0: right eye, 1: left eye, etc.
  probability: number;
}

export type FaceEffectType = 'blur-face' | 'pixelate-face' | 'censor-eyes';

export interface PaintCanvasRef {
  applyFaceEffects: (faces: FaceDetection[], effect: FaceEffectType) => void;
  getDataUrl: () => string | null;
}