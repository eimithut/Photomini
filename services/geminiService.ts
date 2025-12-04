import { GoogleGenAI } from "@google/genai";

export const editImageWithPhotominiAI = async (
  imageBase64: string,
  prompt: string
): Promise<string> => {
  
  // Access the key using process.env.API_KEY as per guidelines
  const apiKey = process.env.API_KEY;

  // Validation check
  if (!apiKey) {
    throw new Error(
      "API Key is missing. Please ensure 'process.env.API_KEY' is configured."
    );
  }

  // Create new instance using the injected key
  const ai = new GoogleGenAI({ apiKey: apiKey });
  
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
    // Pass through the specific error message if possible
    throw new Error(error.message || "Failed to contact Photomini AI");
  }
};