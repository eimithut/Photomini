import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { ManualToolType, BrushSettings, PaintCanvasRef, FaceDetection, FaceEffectType } from '../types';

interface PaintCanvasProps {
  imageSrc: string;
  restoreImageSrc: string; // The image to "restore" to when using the Eraser
  tool: ManualToolType;
  settings: BrushSettings;
  filterStyle: React.CSSProperties; // CSS filters to display visually (brightness etc)
  onUpdate: (newImageBase64: string) => void;
  className?: string;
  faces?: FaceDetection[]; // Optional: Detect faces to show outlines
}

export const PaintCanvas = forwardRef<PaintCanvasRef, PaintCanvasProps>(({
  imageSrc,
  restoreImageSrc,
  tool,
  settings,
  filterStyle,
  onUpdate,
  className,
  faces
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null); // New overlay for outlines
  
  // Reuse a single offscreen canvas for blur operations to avoid memory churn
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Buffers for complex tools (Invert, Lighten, etc.)
  const snapshotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // restoreImgRef holds the "clean" version of the image (before current manual edits)
  const restoreImgRef = useRef<HTMLImageElement | null>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Helper to calculate face rotation and center
  const getFaceGeometry = (face: FaceDetection) => {
    const { originX, originY, width, height } = face.boundingBox;
    const centerX = originX + width / 2;
    const centerY = originY + height / 2;
    
    // Default angle
    let angle = 0;
    
    // Calculate rotation if landmarks exist (Right Eye vs Left Eye)
    if (face.landmarks && face.landmarks.length >= 2) {
       const rightEye = face.landmarks[0];
       const leftEye = face.landmarks[1];
       // Calculate angle in radians
       angle = Math.atan2(leftEye.y - rightEye.y, leftEye.x - rightEye.x);
    }

    return { centerX, centerY, width, height, angle };
  };

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getDataUrl: () => canvasRef.current?.toDataURL('image/png') || null,
    applyFaceEffects: (facesToProcess: FaceDetection[], effect: FaceEffectType) => {
       const canvas = canvasRef.current;
       const ctx = canvas?.getContext('2d', { willReadFrequently: true });
       if (!canvas || !ctx) return;

       ctx.save();
       
       facesToProcess.forEach(face => {
          const { centerX, centerY, width, height, angle } = getFaceGeometry(face);

          ctx.save();
          
          if (effect === 'censor-eyes' && face.landmarks && face.landmarks.length >= 2) {
             // For eyes, we do a rotated rectangle strip
             ctx.translate(centerX, centerY);
             ctx.rotate(angle);
             
             // Bar dimensions relative to face width
             const barWidth = width * 1.0; 
             const barHeight = height * 0.25; 
             
             // Move to center of bar area (which is roughly the eye line, usually slightly above geometric center of box)
             // We adjust Y slightly up because bbox center is usually nose/cheek area
             const eyeYOffset = -height * 0.1;

             ctx.fillStyle = '#000000';
             ctx.fillRect(-barWidth/2, eyeYOffset - barHeight/2, barWidth, barHeight);
          } 
          else {
             // For Blur/Pixelate: Use Rotated Ellipse for exact fit
             ctx.translate(centerX, centerY);
             ctx.rotate(angle);

             // Define Elliptical Clipping Path
             ctx.beginPath();
             // Radii: width/2 and height/2. 
             // We scale slightly (0.5) to fit EXACTLY within the box without overflow
             ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, 2 * Math.PI);
             ctx.clip();

             // Now we are drawing inside the rotated ellipse (coordinate system 0,0 is center of face)
             
             // Since we can't easily pixelate a rotated area without sampling issues,
             // for Pixelate/Blur, we will capture the UPRIGHT bounding box from the main canvas, process it, 
             // and then draw it into the rotated clip.
             
             // We use a temporary canvas to apply blur/pixelate to the captured texture
             const tempC = document.createElement('canvas');
             tempC.width = width;
             tempC.height = height;
             const tCtx = tempC.getContext('2d');
             
             if (tCtx) {
                 // Capture the face area from source (Upright approximation is used for source texture)
                 const { originX, originY } = face.boundingBox;
                 tCtx.drawImage(canvas, originX, originY, width, height, 0, 0, width, height);
                 
                 // Apply Effect to Temp Canvas
                 if (effect === 'blur-face') {
                    const blurAmount = Math.max(3, width / 15);
                    const blurC = document.createElement('canvas');
                    blurC.width = width;
                    blurC.height = height;
                    const bCtx = blurC.getContext('2d');
                    if (bCtx) {
                        bCtx.filter = `blur(${blurAmount}px)`;
                        bCtx.drawImage(tempC, 0, 0);
                        tCtx.clearRect(0, 0, width, height);
                        tCtx.drawImage(blurC, 0, 0);
                    }
                 } 
                 else if (effect === 'pixelate-face') {
                    const pixelSize = Math.max(4, Math.floor(width / 15));
                    // Simple pixelate of the temp canvas by downscaling then upscaling
                    const smallW = Math.max(1, Math.floor(width / pixelSize));
                    const smallH = Math.max(1, Math.floor(height / pixelSize));
                    
                    const tinyC = document.createElement('canvas');
                    tinyC.width = smallW;
                    tinyC.height = smallH;
                    const tinyCtx = tinyC.getContext('2d');
                    if(tinyCtx) {
                        tinyCtx.drawImage(tempC, 0, 0, smallW, smallH);
                        // Draw back large with nearest-neighbor
                        tCtx.imageSmoothingEnabled = false;
                        tCtx.clearRect(0, 0, width, height);
                        tCtx.drawImage(tinyC, 0, 0, width, height);
                    }
                 }
                 
                 // Draw the processed texture into the ROTATED clipping path
                 // We draw it centered at 0,0 (which is the center of the ellipse)
                 ctx.drawImage(tempC, -width/2, -height/2);
             }
          }
          
          ctx.restore();
       });
       
       ctx.restore();
       onUpdate(canvas.toDataURL('image/png'));
    }
  }));

  // Initialize canvas with image
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Sync overlay dimensions
      if (overlayRef.current) {
        overlayRef.current.width = img.width;
        overlayRef.current.height = img.height;
      }
      
      ctx.drawImage(img, 0, 0);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Load restore image (checkpoint) separately
  useEffect(() => {
    if (!restoreImageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      restoreImgRef.current = img;
    };
    img.src = restoreImageSrc;
  }, [restoreImageSrc]);

  // Handle drawing temporary outlines for detected faces
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    // Always clear previous boxes
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (faces && faces.length > 0) {
       faces.forEach(face => {
          const { centerX, centerY, width, height, angle } = getFaceGeometry(face);
          
          ctx.save();
          ctx.translate(centerX, centerY);
          ctx.rotate(angle);

          // Draw Ellipse Outline
          ctx.beginPath();
          ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, 2 * Math.PI);
          
          ctx.strokeStyle = '#ef4444'; // Red-500
          ctx.lineWidth = Math.max(2, width * 0.03); 
          ctx.stroke();

          // Add faint red tint inside
          ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
          ctx.fill();
          
          ctx.restore();
       });
    }
  }, [faces]);

  // Helpers to manage offscreen canvases
  const ensureBufferCanvases = (width: number, height: number) => {
    if (!snapshotCanvasRef.current) snapshotCanvasRef.current = document.createElement('canvas');
    if (!strokeCanvasRef.current) strokeCanvasRef.current = document.createElement('canvas');

    const snap = snapshotCanvasRef.current;
    const stroke = strokeCanvasRef.current;

    if (snap.width !== width || snap.height !== height) {
      snap.width = width;
      snap.height = height;
    }
    if (stroke.width !== width || stroke.height !== height) {
      stroke.width = width;
      stroke.height = height;
    }
    return { snap, stroke };
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const isComplexTool = (t: ManualToolType) => {
    return ['invert', 'desaturate', 'tint', 'lighten', 'darken'].includes(t);
  };

  // --- Drawing Implementation Helpers ---

  const applyBrush = (ctx: CanvasRenderingContext2D, x: number, y: number, prevX: number, prevY: number) => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = settings.size;
    ctx.strokeStyle = settings.color;
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const applyCensor = (ctx: CanvasRenderingContext2D, x: number, y: number, prevX: number, prevY: number) => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'butt'; 
    ctx.lineJoin = 'bevel';
    ctx.lineWidth = settings.size; 
    ctx.strokeStyle = '#000000'; 
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const applyEraser = (ctx: CanvasRenderingContext2D, cx: number, cy: number) => {
    if (restoreImgRef.current) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, settings.size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(restoreImgRef.current, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(cx, cy, settings.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const applyBlur = (ctx: CanvasRenderingContext2D, cx: number, cy: number) => {
    const r = settings.size / 2;
    const blurAmount = Math.max(1, settings.intensity);
    const padding = blurAmount * 2;
    const sX = cx - r - padding;
    const sY = cy - r - padding;
    const sW = (r + padding) * 2;
    const sH = (r + padding) * 2;

    if (!tempCanvasRef.current) {
      tempCanvasRef.current = document.createElement('canvas');
    }
    const tempC = tempCanvasRef.current;
    if (tempC.width !== sW || tempC.height !== sH) {
       tempC.width = sW;
       tempC.height = sH;
    }
    const tCtx = tempC.getContext('2d');
    
    if (tCtx) {
      tCtx.clearRect(0, 0, sW, sH);
      tCtx.filter = `blur(${blurAmount}px)`;
      tCtx.drawImage(ctx.canvas, sX, sY, sW, sH, 0, 0, sW, sH);

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(tempC, sX, sY);
      ctx.restore();
    }
  };

  const applyPixelate = (ctx: CanvasRenderingContext2D, cx: number, cy: number) => {
    const size = settings.size;
    const pixelSize = Math.max(2, settings.intensity);
    
    const startX = Math.max(0, Math.floor(cx - size/2));
    const startY = Math.max(0, Math.floor(cy - size/2));
    const endX = Math.min(ctx.canvas.width, Math.ceil(cx + size/2));
    const endY = Math.min(ctx.canvas.height, Math.ceil(cy + size/2));
    
    const w = endX - startX;
    const h = endY - startY;
    if (w <= 0 || h <= 0) return;

    const imageData = ctx.getImageData(startX, startY, w, h);
    const data = imageData.data;
    
    const gridStartX = Math.floor(startX / pixelSize) * pixelSize;
    const gridStartY = Math.floor(startY / pixelSize) * pixelSize;

    for (let py = gridStartY; py < endY; py += pixelSize) {
        for (let px = gridStartX; px < endX; px += pixelSize) {
            const centerX = px + pixelSize/2;
            const centerY = py + pixelSize/2;
            const dist = Math.sqrt(Math.pow(centerX - cx, 2) + Math.pow(centerY - cy, 2));
            if (dist > size/2) continue;

            const sampleX = Math.floor(centerX) - startX;
            const sampleY = Math.floor(centerY) - startY;
            
            if (sampleX < 0 || sampleX >= w || sampleY < 0 || sampleY >= h) continue;

            const i = (sampleY * w + sampleX) * 4;
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];

            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(px, py, pixelSize, pixelSize);
        }
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;

    const { x, y } = coords;
    const prevX = lastPos.current ? lastPos.current.x : x;
    const prevY = lastPos.current ? lastPos.current.y : y;

    if (isComplexTool(tool)) {
      const { snap, stroke } = ensureBufferCanvases(canvas.width, canvas.height);
      const strokeCtx = stroke.getContext('2d');
      if (!strokeCtx) return;

      strokeCtx.lineCap = 'round';
      strokeCtx.lineJoin = 'round';
      strokeCtx.lineWidth = settings.size;
      
      if (tool === 'darken') {
        strokeCtx.strokeStyle = '#000000'; 
      } else if (tool === 'lighten' || tool === 'desaturate' || tool === 'invert') {
        strokeCtx.strokeStyle = '#ffffff'; 
      } else if (tool === 'tint') {
        strokeCtx.strokeStyle = settings.color;
      }

      strokeCtx.beginPath();
      strokeCtx.moveTo(prevX, prevY);
      strokeCtx.lineTo(x, y);
      strokeCtx.stroke();

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.drawImage(snap, 0, 0);

      if (tool === 'invert') {
        ctx.globalCompositeOperation = 'difference';
        ctx.drawImage(stroke, 0, 0);
      } else if (tool === 'desaturate') {
        ctx.globalCompositeOperation = 'saturation';
        ctx.drawImage(stroke, 0, 0);
      } else if (tool === 'tint') {
        ctx.globalCompositeOperation = 'color';
        ctx.drawImage(stroke, 0, 0);
      } else if (tool === 'lighten') {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.4;
        ctx.drawImage(stroke, 0, 0);
      } else if (tool === 'darken') {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.4;
        ctx.drawImage(stroke, 0, 0);
      }
      ctx.globalAlpha = 1.0;
    } 
    else {
      ctx.save();
      
      if (tool === 'brush') {
        applyBrush(ctx, x, y, prevX, prevY);
      } 
      else if (tool === 'censor') {
        applyCensor(ctx, x, y, prevX, prevY);
      }
      else {
        const dist = Math.hypot(x - prevX, y - prevY);
        const angle = Math.atan2(y - prevY, x - prevX);
        const step = Math.max(1, settings.size / 4); 
        
        for (let i = 0; i <= dist; i += step) {
           const cx = prevX + Math.cos(angle) * i;
           const cy = prevY + Math.sin(angle) * i;
           
           if (tool === 'eraser') applyEraser(ctx, cx, cy);
           else if (tool === 'blur') applyBlur(ctx, cx, cy);
           else if (tool === 'pixelate') applyPixelate(ctx, cx, cy);
        }
      }
      ctx.restore();
    }

    lastPos.current = { x, y };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const coords = getCoordinates(e);
    if (coords) lastPos.current = coords;

    const canvas = canvasRef.current;
    if (canvas && isComplexTool(tool)) {
      const { snap, stroke } = ensureBufferCanvases(canvas.width, canvas.height);
      const snapCtx = snap.getContext('2d');
      const strokeCtx = stroke.getContext('2d');
      
      if (snapCtx && strokeCtx) {
        snapCtx.clearRect(0, 0, snap.width, snap.height);
        snapCtx.drawImage(canvas, 0, 0);
        strokeCtx.clearRect(0, 0, stroke.width, stroke.height);
      }
    }

    draw(e);
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      lastPos.current = null;
      if (canvasRef.current) {
        onUpdate(canvasRef.current.toDataURL('image/png'));
      }
    }
  };

  return (
    <div className={`relative w-fit h-fit mx-auto ${className}`}>
        <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="block max-w-full max-h-full object-contain cursor-crosshair touch-none"
            style={{ ...filterStyle }}
        />
        <canvas
            ref={overlayRef}
            className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
            style={{ ...filterStyle }}
        />
    </div>
  );
});

PaintCanvas.displayName = 'PaintCanvas';