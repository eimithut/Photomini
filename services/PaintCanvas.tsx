import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { ManualToolType, BrushSettings, PaintCanvasRef, FaceDetection, FaceEffectType } from '../types';

interface PaintCanvasProps {
  imageSrc: string;
  tool: ManualToolType;
  settings: BrushSettings;
  filterStyle: React.CSSProperties; // CSS filters to display visually (brightness etc)
  onUpdate: (newImageBase64: string) => void;
  className?: string;
}

export const PaintCanvas = forwardRef<PaintCanvasRef, PaintCanvasProps>(({
  imageSrc,
  tool,
  settings,
  filterStyle,
  onUpdate,
  className
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // We keep a pristine copy of the original image for the Eraser tool to restore from
  const originalImgRef = useRef<HTMLImageElement | null>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getDataUrl: () => canvasRef.current?.toDataURL('image/png') || null,
    applyFaceEffects: (faces: FaceDetection[], effect: FaceEffectType) => {
       const canvas = canvasRef.current;
       const ctx = canvas?.getContext('2d', { willReadFrequently: true });
       if (!canvas || !ctx) return;

       ctx.save();
       
       faces.forEach(face => {
          const { originX: x, originY: y, width, height } = face.boundingBox;

          if (effect === 'censor-eyes') {
             // Logic to draw bar across eyes
             // landmarks[0] = right eye, landmarks[1] = left eye
             const rightEye = face.landmarks[0];
             const leftEye = face.landmarks[1];
             
             // Calculate center point between eyes
             const centerX = (rightEye.x + leftEye.x) / 2;
             const centerY = (rightEye.y + leftEye.y) / 2;
             
             // Bar dimensions relative to face width
             const barWidth = width * 1.0; 
             const barHeight = height * 0.25; 
             
             ctx.fillStyle = '#000000';
             ctx.fillRect(centerX - barWidth/2, centerY - barHeight/2, barWidth, barHeight);
          } else if (effect === 'blur-face') {
             // Blur only the face region
             const blurAmount = 10;
             // We use a temporary canvas to apply blur
             const tempCanvas = document.createElement('canvas');
             tempCanvas.width = width;
             tempCanvas.height = height;
             const tCtx = tempCanvas.getContext('2d');
             if (tCtx) {
                tCtx.filter = `blur(${blurAmount}px)`;
                tCtx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
                // Draw blurred patch back
                ctx.drawImage(tempCanvas, x, y);
             }
          } else if (effect === 'pixelate-face') {
             // Pixelate only the face region
             const pixelSize = Math.max(8, width / 20); // Dynamic pixel size
             const startX = Math.floor(x);
             const startY = Math.floor(y);
             
             for (let py = startY; py < startY + height; py += pixelSize) {
                for (let px = startX; px < startX + width; px += pixelSize) {
                   // Get color of the center of the block
                   const sampleX = Math.min(px + pixelSize/2, canvas.width - 1);
                   const sampleY = Math.min(py + pixelSize/2, canvas.height - 1);
                   const p = ctx.getImageData(sampleX, sampleY, 1, 1).data;
                   
                   ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`;
                   ctx.fillRect(px, py, pixelSize, pixelSize);
                }
             }
          }
       });
       
       ctx.restore();
       // Trigger update to save history
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
      // Set canvas size to match image resolution
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      originalImgRef.current = img;
    };
    img.src = imageSrc;
  }, [imageSrc]);

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

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;

    const { x, y } = coords;
    
    // Safety check for lastPos
    const prevX = lastPos.current ? lastPos.current.x : x;
    const prevY = lastPos.current ? lastPos.current.y : y;

    ctx.save();

    if (tool === 'brush') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = settings.size;
      ctx.strokeStyle = settings.color;
      
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.stroke();
    } 
    else if (tool === 'censor') {
      // Censor Bar: Black rectangle strips
      // Using 'butt' lineCap creates flat edges, perfect for censor bars
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'butt'; 
      ctx.lineJoin = 'bevel';
      ctx.lineWidth = settings.size; // Width of the bar
      ctx.strokeStyle = '#000000'; // Always black
      
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    else if (tool === 'lighten' || tool === 'darken') {
      // Lighten (Dodge) / Darken (Burn)
      // We draw a soft circle with a specific blend mode
      const opacity = 0.05; // Low opacity for buildup effect
      ctx.globalCompositeOperation = tool === 'lighten' ? 'screen' : 'multiply';
      ctx.fillStyle = tool === 'lighten' ? `rgba(255,255,255,${opacity})` : `rgba(0,0,0,${opacity})`;
      
      // Interpolate between points to prevent gaps when moving fast
      const dist = Math.hypot(x - prevX, y - prevY);
      const angle = Math.atan2(y - prevY, x - prevX);
      const step = settings.size / 4; // Dense steps for smooth stroke
      
      for (let i = 0; i <= dist; i += step) {
        const cx = prevX + Math.cos(angle) * i;
        const cy = prevY + Math.sin(angle) * i;
        ctx.beginPath();
        ctx.arc(cx, cy, settings.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    else if (tool === 'eraser') {
      // Smart Eraser: Restores from original image
      if (originalImgRef.current) {
        ctx.beginPath();
        ctx.arc(x, y, settings.size / 2, 0, Math.PI * 2);
        ctx.clip();
        // Draw the original image over the current canvas at the clip location
        // This effectively "erases" any edits by showing what was underneath
        ctx.drawImage(originalImgRef.current, 0, 0);
      } else {
        // Fallback if original is missing (shouldn't happen)
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, settings.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    else if (tool === 'blur') {
      // Optimized Blur
      // Instead of drawing the whole canvas, we only process the patch
      const r = settings.size / 2;
      const blurAmount = settings.intensity;
      
      // Define the area to blur (brush tip)
      // We add a bit of padding to avoid hard edges in the filter calculation
      const padding = blurAmount * 2;
      const sX = x - r - padding;
      const sY = y - r - padding;
      const sW = (r + padding) * 2;
      const sH = (r + padding) * 2;

      // Create a circular clipping path
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();

      // Apply blur filter
      ctx.filter = `blur(${blurAmount}px)`;
      
      // Draw ONLY the patch of the canvas back onto itself
      // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
      ctx.drawImage(canvas, sX, sY, sW, sH, sX, sY, sW, sH);
    }
    else if (tool === 'pixelate') {
      const size = settings.size;
      const pixelSize = Math.max(2, settings.intensity); 
      
      const startX = Math.max(0, x - size/2);
      const startY = Math.max(0, y - size/2);
      const endX = Math.min(canvas.width, x + size/2);
      const endY = Math.min(canvas.height, y + size/2);

      const gridStartX = Math.floor(startX / pixelSize) * pixelSize;
      const gridStartY = Math.floor(startY / pixelSize) * pixelSize;

      for (let py = gridStartY; py < endY; py += pixelSize) {
        for (let px = gridStartX; px < endX; px += pixelSize) {
          const dist = Math.sqrt(Math.pow(px + pixelSize/2 - x, 2) + Math.pow(py + pixelSize/2 - y, 2));
          if (dist > size/2) continue;

          const p = ctx.getImageData(px, py, 1, 1).data;
          ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`;
          ctx.fillRect(px, py, pixelSize, pixelSize);
        }
      }
    }

    ctx.restore();
    lastPos.current = { x, y };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const coords = getCoordinates(e);
    if (coords) lastPos.current = coords;
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
    <div className={`relative max-w-full max-h-full ${className}`}>
        <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="max-w-full max-h-[80vh] object-contain block cursor-crosshair touch-none"
            style={{
                // Apply the visual CSS filters (brightness etc) to the canvas view
                ...filterStyle 
            }}
        />
    </div>
  );
});

PaintCanvas.displayName = 'PaintCanvas';