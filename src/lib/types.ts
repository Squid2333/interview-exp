export type QuestionStatus = "todo" | "mastered";

export interface QuestionSummary {
  id: string;
  title: string;
  category: string;
  tags: string[];
  status: QuestionStatus;
  createdAt: string;
  updatedAt: string;
  nextReviewAt: string | null;
  noteCount: number;
  hasAnswer: boolean;
  isFavorite: boolean;
}

export interface Answer {
  id: string;
  content: string;
  source: "ai" | "manual";
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface WeakNote {
  id: string;
  content: string;
  sourceMessageId: string | null;
  createdAt: string;
}

export interface QuestionDetail extends QuestionSummary {
  answer: Answer | null;
  messages: ChatMessage[];
  notes: WeakNote[];
}

export interface DashboardStats {
  total: number;
  todo: number;
  mastered: number;
  due: number;
  favorites: number;
}

export interface CategoryInfo {
  name: string;
  questionCount: number;
}
