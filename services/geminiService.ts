import { GoogleGenAI } from "@google/genai";

// Declare the global constant injected by Vite
declare const __API_KEY__: string;

export const editImageWithPhotominiAI = async (
  imageBase64: string,
  prompt: string
): Promise<string> => {
  
  // Validation check
  if (typeof __API_KEY__ === 'undefined' || !__API_KEY__) {
    throw new Error(
      "API Key is missing. If you are on Cloudflare Pages, make sure you added the 'API_KEY' environment variable and then TRIGGERED A NEW BUILD (Retry Deployment). The key is baked in at build time."
    );
  }

  // Create new instance using the injected key
  const ai = new GoogleGenAI({ apiKey: __API_KEY__ });
  
  // Clean base64 string if it contains metadata header
  const cleanBase64 = imageBase64.split(',')[1] || imageBase64;

  // Always use the Flash Image model (Standard)
  const modelName = 'gemini-2.5-flash-image';

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
  } catch (error: any) {
    console.error("Photomini AI API Error:", error);
    throw new Error(error.message || "Failed to contact Photomini AI");
  }
};