// Text Recognition Utilities
// This file provides different approaches for text recognition in Expo apps

/**
 * Mock OCR for development and testing
 */
export const MockTextRecognition = {
  detectFromUri: async (uri) => {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      blocks: [
        {
          text: "Math Problem: 2x + 5 = 15",
          boundingBox: { left: 50, top: 100, width: 250, height: 40 },
          confidence: 0.95,
        },
        {
          text: "Solve for x",
          boundingBox: { left: 50, top: 150, width: 120, height: 30 },
          confidence: 0.92,
        },
        {
          text: "Show your work below:",
          boundingBox: { left: 50, top: 200, width: 200, height: 25 },
          confidence: 0.88,
        },
      ],
    };
  },
};

/**
 * Google Cloud Vision API implementation
 * Requires API key and setup
 */
export const GoogleVisionOCR = {
  detectFromUri: async (uri, apiKey) => {
    try {
      const base64Image = await convertImageToBase64(uri);
      
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                image: {
                  content: base64Image,
                },
                features: [
                  {
                    type: 'TEXT_DETECTION',
                    maxResults: 10,
                  },
                ],
              },
            ],
          }),
        }
      );

      const result = await response.json();
      
      if (result.responses && result.responses[0].textAnnotations) {
        return {
          blocks: result.responses[0].textAnnotations.map(annotation => ({
            text: annotation.description,
            boundingBox: {
              left: annotation.boundingPoly.vertices[0].x,
              top: annotation.boundingPoly.vertices[0].y,
              width: annotation.boundingPoly.vertices[2].x - annotation.boundingPoly.vertices[0].x,
              height: annotation.boundingPoly.vertices[2].y - annotation.boundingPoly.vertices[0].y,
            },
            confidence: annotation.score || 0.9,
          })),
        };
      }
      
      return { blocks: [] };
    } catch (error) {
      console.error('Google Vision OCR Error:', error);
      throw error;
    }
  },
};

/**
 * Convert image URI to base64
 */
const convertImageToBase64 = async (uri) => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error converting image to base64:', error);
    throw error;
  }
};

/**
 * Configuration for different OCR providers
 */
export const OCR_PROVIDERS = {
  MOCK: 'mock',
  GOOGLE_VISION: 'google_vision',
  // Add more providers as needed
};

/**
 * Main text recognition function
 * Choose provider based on your needs
 */
export const detectTextFromImage = async (uri, provider = OCR_PROVIDERS.MOCK, config = {}) => {
  switch (provider) {
    case OCR_PROVIDERS.MOCK:
      return await MockTextRecognition.detectFromUri(uri);
    
    case OCR_PROVIDERS.GOOGLE_VISION:
      if (!config.apiKey) {
        throw new Error('Google Vision API key is required');
      }
      return await GoogleVisionOCR.detectFromUri(uri, config.apiKey);
    
    default:
      throw new Error(`Unknown OCR provider: ${provider}`);
  }
};