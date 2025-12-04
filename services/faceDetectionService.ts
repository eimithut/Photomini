import { FaceDetection } from '../types';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

let faceDetector: FaceDetector | null = null;

export const initializeFaceDetector = async () => {
  if (faceDetector) return faceDetector;

  console.log("Loading MediaPipe Vision...");
  
  // Load the WASM binary for MediaPipe
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );

  faceDetector = await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
      delegate: "GPU"
    },
    runningMode: "IMAGE",
    // 0.15 allows "weak" faces (like masks) to be detected
    // We will use geometric filtering (aspect ratio) to remove false positives
    minDetectionConfidence: 0.15, 
    minSuppressionThreshold: 0.3
  });

  console.log("MediaPipe Face Detector loaded");
  return faceDetector;
};

export const detectFaces = async (imageSrc: string): Promise<FaceDetection[]> => {
  return new Promise(async (resolve, reject) => {
    try {
      const detector = await initializeFaceDetector();
      
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          // In some environments, detect might need the image to be fully decoded
          const result = detector.detect(img);
          
          if (!result || !result.detections) {
            resolve([]);
            return;
          }

          const validFaces: FaceDetection[] = [];
          
          result.detections.forEach((det: any) => {
             const { originX, originY, width, height } = det.boundingBox;
             
             // --- GEOMETRIC FILTERS ---
             
             // 1. Size Filter: Ignore extremely small specks (noise)
             // Must be at least 20px or 2% of image dimension
             const minSize = Math.min(img.width, img.height) * 0.02;
             if (width < 20 || height < 20 || width < minSize) {
               return; 
             }

             // 2. Aspect Ratio Filter:
             // Roblox heads are blocks (Square). Human faces are slightly rectangular.
             // Gaps between legs/cones are usually thin vertical slivers (Ratio < 0.4).
             // We only accept boxes that are somewhat square-ish.
             const ratio = width / height;
             // Reject if too thin (vertical line) or too flat (horizontal line)
             if (ratio < 0.5 || ratio > 2.0) {
               return;
             }

             validFaces.push({
               boundingBox: det.boundingBox,
               landmarks: det.keypoints ? det.keypoints.map((kp: any) => ({ 
                   x: kp.x * img.width, 
                   y: kp.y * img.height 
               })) : [],
               probability: det.categories[0].score
             });
          });

          resolve(validFaces);
        } catch (err) {
          console.error("MediaPipe detection error:", err);
          resolve([]);
        }
      };
      img.onerror = () => reject(new Error("Failed to load image for detection"));
      img.src = imageSrc;
    } catch (err) {
      reject(err);
    }
  });
};