import { GoogleGenAI, Type } from "@google/genai";
import { Question, StudyPlanDay, StudyMaterialContent } from "../types";

// Ensure API key is available
const apiKey = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

/**
 * Generates a batch of questions.
 * If `sourceMaterial` is provided, questions are generated strictly based on that text (Reading Comprehension).
 * Otherwise, questions are generated based on the general topic and difficulty level (Adaptive Drill).
 */
export const generateAdaptiveQuestions = async (
  topic: string,
  currentDifficulty: number,
  previousTopics: string[] = [],
  count: number = 3,
  sourceMaterial?: string
): Promise<Question[]> => {
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  const modelName = 'gemini-2.5-flash';
  
  let systemInstruction = "";
  let promptContent = "";

  if (sourceMaterial) {
    // --- MODE 1: Context-Aware / Reading Comprehension Mode ---
    systemInstruction = `
      You are a strict examiner creating a reading comprehension test.
      
      INPUT CONTEXT:
      The student has just read a specific study guide about "${topic}".
      
      GOAL:
      Generate ${count} multiple-choice questions based STRICTLY on the provided "Source Material".
      
      REQUIREMENTS:
      1. Questions must test understanding of the specific concepts, definitions, or mechanisms explained in the text.
      2. Do NOT ask general knowledge questions that are not covered in the text.
      3. Language: Simplified Chinese (简体中文).
      4. Difficulty: Match the complexity of the text provided.
      
      Return the response in strict JSON format as an Array of Question objects.
    `;
    
    // Truncate material slightly if absolutely massive to avoid token limits, though 2.5 Flash handles large context well.
    promptContent = `
      Source Material:
      """
      ${sourceMaterial.substring(0, 15000)}
      """
      
      Generate ${count} questions based on the text above.
    `;

  } else {
    // --- MODE 2: General Adaptive Mode ---
    systemInstruction = `
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
    promptContent = `Generate ${count} multiple choice questions about ${topic} in Simplified Chinese.`;
  }

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: promptContent,
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

/**
 * Generates a 5-day study plan for the given topic.
 */
export const generateStudyPlan = async (
  topic: string, 
  currentDifficulty: number
): Promise<StudyPlanDay[]> => {
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }
  
  const modelName = 'gemini-2.5-flash';
  
  const systemInstruction = `
    You are a study planning assistant. Create a structured 5-day study plan for a student learning "${topic}".
    The student's current level is ${currentDifficulty}/100.
    Output MUST be in Simplified Chinese (简体中文).
    Return a JSON array of 5 objects (Day 1 to Day 5).
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `Create a 5-day study plan for ${topic}.`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              day: { type: Type.INTEGER },
              topic: { type: Type.STRING, description: "Main theme of the day" },
              focus: { type: Type.STRING, description: "Key learning objective" },
              activities: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "List of 3 distinct activities (reading, practice, etc.)"
              }
            },
            required: ["day", "topic", "focus", "activities"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No plan generated");
    
    return JSON.parse(text) as StudyPlanDay[];
  } catch (error) {
    console.error("Plan Generation Error:", error);
    return [];
  }
};

/**
 * Generates concise study material (Markdown/Text).
 * UPDATED: Focused on Depth, Technical Rigor, and Mechanisms.
 */
export const generateStudyMaterial = async (
  mainTopic: string,
  subTopic: string,
  focus: string,
  level: number
): Promise<StudyMaterialContent> => {
  if (!apiKey) throw new Error("API Key is missing.");

  const modelName = 'gemini-2.5-flash';
  
  // Force a higher base level for material generation to ensure depth, even if the user is new.
  const effectiveLevel = Math.max(level, 60);

  const systemInstruction = `
    You are a distinguished professor and industry expert.
    Your goal is to provide a **comprehensive, in-depth, and rigorous** academic explanation of "${subTopic}" (context: ${mainTopic}) with a focus on "${focus}".
    Target Audience Level: ${effectiveLevel}/100 (The student is capable and desires mastery).

    STRICT CONTENT REQUIREMENTS:
    1. **Depth over Simplicity**: Do NOT dumb down the content. Your priority is technical accuracy and depth. Use professional terminology standard in the field.
    2. **Structure**:
       - **Academic Definition (学术定义)**: The precise, formal definition used in textbooks or documentation.
       - **Core Mechanism (底层原理)**: How does it actually work? (e.g., memory management, mathematical proof, physical process, algorithm steps). Go deep into the "how" and "why".
       - **Critical Analysis (深度辨析)**: Discuss trade-offs, limitations, edge cases, or compare with similar concepts.
       - **Professional Application (实战场景)**: A non-trivial scenario showing how this knowledge is applied in a professional setting.
    3. **Tone**: Professional, authoritative, insightful, and dense with information.
    4. **Language**: Simplified Chinese (简体中文).
    5. **Format**: Return a JSON object with a single 'markdown' field containing the study guide. It should be substantial (approx 600-800 words). Use standard Markdown headers (##, ###), bolding, list, and code blocks (if applicable) for structure.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `Provide an in-depth lecture on ${subTopic}.`,
      config: { 
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            markdown: { type: Type.STRING }
          },
          required: ["markdown"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response");

    return JSON.parse(text) as StudyMaterialContent;

  } catch (error) {
    console.error("Material Generation Error:", error);
    return {
      markdown: "生成深度学习材料时出错，请直接开始测验。"
    };
  }
};

/**
 * Explains a specific selected concept or phrase within context.
 */
export const explainConcept = async (
  selectedText: string,
  contextTopic: string
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is missing.");

  const modelName = 'gemini-2.5-flash';

  const systemInstruction = `
    You are a helpful teaching assistant.
    The student is reading material about "${contextTopic}" and has highlighted the text: "${selectedText}".
    
    Please provide a clear, concise, and helpful explanation of this specific term or phrase.
    - If it is a technical term, define it.
    - If it is a complex sentence, break it down.
    - Use an analogy if helpful.
    - Keep the response relatively short (under 200 words) so it fits in a popup card.
    - Language: Simplified Chinese (简体中文).
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `Explain "${selectedText}" in the context of ${contextTopic}.`,
      config: {
        systemInstruction,
        responseMimeType: "text/plain"
      }
    });

    return response.text || "无法解释该内容。";
  } catch (error) {
    console.error("Explanation Error:", error);
    return "AI 连接失败，无法解释。";
  }
};
