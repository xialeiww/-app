import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

// Ensure API key is available
const apiKey = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

/**
 * Generates a batch of questions based on the topic and current user difficulty level.
 */
export const generateAdaptiveQuestions = async (
  topic: string,
  currentDifficulty: number,
  previousTopics: string[] = [],
  count: number = 3
): Promise<Question[]> => {
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  const modelName = 'gemini-2.5-flash';

  const systemInstruction = `
    You are an expert adaptive tutor engine. 
    Your goal is to generate ${count} distinct multiple-choice questions to test a student on the subject of "${topic}".
    IMPORTANT: All text in the output JSON (question, options, explanation, topicSubCategory) MUST be in Simplified Chinese (简体中文).
    
    The student's current proficiency level is: ${currentDifficulty}/100.
    
    - Level 0-20: Beginner (Basic definitions, simple concepts).
    - Level 21-50: Intermediate (Application of concepts, common scenarios).
    - Level 51-80: Advanced (Complex reasoning, edge cases, synthesis).
    - Level 81-100: Expert (Nuanced mastery, highly technical, deep understanding).
    
    Current Objective: Generate questions that matches this difficulty level exactly.
    Do not repeat these recent sub-topics: ${previousTopics.slice(-5).join(', ')}.
    
    Return the response in strict JSON format as an Array of Question objects.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `Generate ${count} multiple choice questions about ${topic} in Simplified Chinese.`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: {
                type: Type.STRING,
                description: "The question text in Chinese."
              },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "An array of 4 distinct options in Chinese."
              },
              correctIndex: {
                type: Type.INTEGER,
                description: "The index (0-3) of the correct answer."
              },
              explanation: {
                type: Type.STRING,
                description: "A helpful explanation of why the correct answer is right and others are wrong, in Chinese."
              },
              topicSubCategory: {
                type: Type.STRING,
                description: "A short tag for the specific concept being tested (e.g. 'Loops', 'Photosynthesis') in Chinese."
              }
            },
            required: ["text", "options", "correctIndex", "explanation", "topicSubCategory"]
          }
        }
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Empty response from AI");
    }

    const questionsData = JSON.parse(responseText) as Question[];
    return questionsData;

  } catch (error) {
    console.error("Gemini API Error:", error);
    // Fallback question in case of total failure
    return [{
      text: "联系 AI 导师时遇到错误。请重试。",
      options: ["重试", "检查网络", "重新加载", "等待"],
      correctIndex: 0,
      explanation: "网络或 API 出现错误。",
      topicSubCategory: "错误处理"
    }];
  }
};