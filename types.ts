export interface Question {
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  topicSubCategory: string;
}

export interface QuizHistoryItem {
  question: string;
  userAnswerIndex: number;
  correctIndex: number;
  isCorrect: boolean;
  timestamp: number;
  difficultyBefore: number;
  difficultyAfter: number;
}

export interface QuizState {
  topic: string;
  difficulty: number; // 0 to 100 scale
  history: QuizHistoryItem[];
  currentQuestion: Question | null;
  isLoading: boolean;
  isAnswering: boolean; // True when user has selected but not moved to next
  feedbackMsg: string | null;
  streak: number;
}

export interface StudyPlanDay {
  day: number;
  topic: string;
  activities: string[];
  focus: string;
  status?: 'locked' | 'current' | 'completed';
}

export interface StudyMaterialContent {
  markdown: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  MATERIAL_VIEW = 'MATERIAL_VIEW',
  QUIZ = 'QUIZ',
  SUMMARY = 'SUMMARY',
  ERROR = 'ERROR'
}