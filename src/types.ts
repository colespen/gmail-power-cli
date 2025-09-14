// Chat message types for Groq API
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolCall {
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatResponse {
  choices: Array<{
    message: {
      content?: string;
      tool_calls?: ToolCall[];
    };
  }>;
}

// Gmail API types
export interface EmailMessage {
  id: string;
  threadId?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  snippet?: string;
  labelIds?: string[];
}

export interface Label {
  id: string;
  name: string;
  type?: string;
}

export interface SearchResult {
  messages?: EmailMessage[];
}

export interface EmailContent {
  id: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  body?: string;
  snippet?: string;
}