import { GoogleGenAI } from "@google/genai";

// Declaration for Vite's define replacement
declare const process: { env: { API_KEY: string } };

// Ensure we have the user's API key before calling
export const ensureApiKey = async (): Promise<boolean> => {
  // Use any cast to avoid type conflicts with global window definitions
  const win = window as any;
  if (win.aistudio && win.aistudio.hasSelectedApiKey) {
    const hasKey = await win.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await win.aistudio.openSelectKey();
      // Re-check to confirm selection
      return await win.aistudio.hasSelectedApiKey();
    }
    return true;
  }
  return false;
};

export type ImageResolution = '1K' | '2K' | '4K';
export type ModelType = 'standard' | 'pro';

export const editImageWithPhotominiAI = async (
  imageBase64: string,
  prompt: string,
  resolution: ImageResolution = '1K',
  modelType: ModelType = 'standard'
): Promise<string> => {
  // Only enforce paid key selection for the Pro model
  if (modelType === 'pro') {
    const hasKey = await ensureApiKey();
    if (!hasKey) {
      throw new Error("API Key selection was cancelled or failed.");
    }
  }

  // Create new instance to ensure latest key is used
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Clean base64 string if it contains metadata header
  const cleanBase64 = imageBase64.split(',')[1] || imageBase64;

  const modelName = modelType === 'pro' 
    ? 'gemini-3-pro-image-preview' 
    : 'gemini-2.5-flash-image';

  const config: any = {};
  
  // Resolution config is only supported on Pro
  if (modelType === 'pro') {
    config.imageConfig = {
      imageSize: resolution
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanBase64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: config
    });

    // Parse response for image
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) {
      throw new Error("No content generated");
    }

    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image data found in response");
  } catch (error) {
    console.error("Photomini AI API Error:", error);
    throw error;
  }
};