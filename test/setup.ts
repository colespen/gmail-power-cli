import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Mock data for testing
export const mockMessages = [
  {
    id: 'test-message-1',
    threadId: 'test-thread-1',
    labelIds: ['INBOX', 'UNREAD'],
    snippet: 'This is a test email message',
    payload: {
      headers: [
        { name: 'Subject', value: 'Test Email Subject' },
        { name: 'From', value: 'sender@example.com' },
        { name: 'To', value: 'recipient@example.com' },
        { name: 'Date', value: 'Wed, 13 Sep 2023 10:00:00 -0700' }
      ],
      body: {
        data: Buffer.from('This is the test email body content.').toString('base64')
      }
    }
  },
  {
    id: 'test-message-2',
    threadId: 'test-thread-2',
    labelIds: ['INBOX'],
    snippet: 'Another test email',
    payload: {
      headers: [
        { name: 'Subject', value: 'Another Test Email' },
        { name: 'From', value: 'another@example.com' },
        { name: 'To', value: 'recipient@example.com' },
        { name: 'Date', value: 'Wed, 13 Sep 2023 11:00:00 -0700' }
      ],
      body: {
        data: Buffer.from('Another test email body.').toString('base64')
      }
    }
  }
];

export const mockLabels = [
  { id: 'INBOX', name: 'INBOX', type: 'system' },
  { id: 'SENT', name: 'SENT', type: 'system' },
  { id: 'STARRED', name: 'STARRED', type: 'system' },
  { id: 'UNREAD', name: 'UNREAD', type: 'system' },
  { id: 'Label_1', name: 'Test Label', type: 'user' },
  { id: 'Label_2', name: 'Work', type: 'user' }
];

export const mockFilters = [
  {
    id: 'filter-1',
    criteria: {
      from: 'notifications@example.com'
    },
    action: {
      addLabelIds: ['Label_1'],
      removeLabelIds: ['INBOX']
    }
  }
];

// Comprehensive Gmail API mock handlers
const handlers = [
  // User profile
  http.get('https://gmail.googleapis.com/gmail/v1/users/me/profile', () => {
    return HttpResponse.json({
      emailAddress: 'test@example.com',
      messagesTotal: 100,
      threadsTotal: 50
    });
  }),

  // List messages with query support
  http.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const maxResults = parseInt(url.searchParams.get('maxResults') || '10');

    // Filter messages based on query
    let filteredMessages = mockMessages;
    if (query) {
      if (query.includes('is:unread')) {
        filteredMessages = mockMessages.filter(m => m.labelIds.includes('UNREAD'));
      } else if (query.includes('from:')) {
        const fromMatch = query.match(/from:([\w@\.]+)/);
        if (fromMatch) {
          const fromEmail = fromMatch[1];
          filteredMessages = mockMessages.filter(m =>
            m.payload.headers.find(h => h.name === 'From' && h.value.includes(fromEmail))
          );
        }
      }
    }

    return HttpResponse.json({
      messages: filteredMessages.slice(0, maxResults).map(m => ({
        id: m.id,
        threadId: m.threadId
      })),
      resultSizeEstimate: filteredMessages.length
    });
  }),

  // Get specific message
  http.get('https://gmail.googleapis.com/gmail/v1/users/me/messages/:messageId', ({ params }) => {
    const messageId = params.messageId as string;
    const message = mockMessages.find(m => m.id === messageId);

    if (!message) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json(message);
  }),

  // Modify message labels
  http.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/:messageId/modify', async ({ params }) => {
    const messageId = params.messageId as string;

    return HttpResponse.json({
      id: messageId,
      labelIds: ['INBOX'], // Simplified response
      modified: 1
    });
  }),

  // Batch modify messages
  http.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify', async ({ request }) => {
    const body = await request.json() as { ids: string[], addLabelIds?: string[], removeLabelIds?: string[] };

    return HttpResponse.json({
      modified: body.ids.length
    });
  }),

  // Send email
  http.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', async () => {
    return HttpResponse.json({
      id: 'sent-message-' + Date.now(),
      labelIds: ['SENT']
    });
  }),

  // List labels
  http.get('https://gmail.googleapis.com/gmail/v1/users/me/labels', () => {
    return HttpResponse.json({
      labels: mockLabels
    });
  }),

  // Create label
  http.post('https://gmail.googleapis.com/gmail/v1/users/me/labels', async ({ request }) => {
    const body = await request.json() as { name: string };
    const newLabel = {
      id: 'Label_' + Date.now(),
      name: body.name,
      type: 'user'
    };

    return HttpResponse.json(newLabel);
  }),

  // List filters
  http.get('https://gmail.googleapis.com/gmail/v1/users/me/settings/filters', () => {
    return HttpResponse.json({
      filter: mockFilters
    });
  }),

  // Create filter
  http.post('https://gmail.googleapis.com/gmail/v1/users/me/settings/filters', async ({ request }) => {
    const body = await request.json() as { criteria: any, action: any };
    const newFilter = {
      id: 'filter-' + Date.now(),
      criteria: body.criteria,
      action: body.action
    };

    return HttpResponse.json(newFilter);
  }),

  // Batch delete (trash)
  http.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/batchDelete', async ({ request }) => {
    const body = await request.json() as { ids: string[] };

    return HttpResponse.json({
      affected: body.ids.length
    });
  })
];

export const server = setupServer(...handlers);

// Mock environment variables
process.env.GROQ_API_KEY = 'test-groq-api-key';

// Mock file system operations
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn()
}));

// Mock Groq SDK
vi.mock('groq-sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{
              message: {
                content: 'Test response',
                tool_calls: []
              }
            }]
          })
        }
      }
    }))
  };
});

// Mock OAuth2 authentication
vi.mock('../src/auth.js', () => ({
  authorize: vi.fn().mockResolvedValue({
    credentials: { access_token: 'mock-token' }
  }),
  getGmailService: vi.fn().mockResolvedValue({
    users: {
      messages: {
        list: vi.fn().mockResolvedValue({ data: { messages: [] } }),
        get: vi.fn().mockResolvedValue({ data: {} }),
        modify: vi.fn().mockResolvedValue({ data: { labelIds: [] } }),
        batchModify: vi.fn().mockResolvedValue({ data: {} }),
        batchDelete: vi.fn().mockResolvedValue({ data: {} }),
        send: vi.fn().mockResolvedValue({ data: { id: 'sent-message-123', labelIds: ['SENT'] } }),
        trash: vi.fn().mockResolvedValue({ data: {} })
      },
      labels: {
        list: vi.fn().mockResolvedValue({ data: { labels: [] } }),
        create: vi.fn().mockResolvedValue({ data: { id: 'new-label-id', name: 'New Test Label' } })
      },
      settings: {
        filters: {
          list: vi.fn().mockResolvedValue({ data: { filter: [] } }),
          create: vi.fn().mockResolvedValue({ data: { id: 'new-filter-id' } })
        }
      }
    }
  })
}));

// Mock chalk for consistent styling with proper chaining
const createChalkFunction = (text: string) => `[MOCK]${text}[/MOCK]`;

// Create a chainable mock function
const createChainableMock = () => {
  const mockFn = vi.fn(createChalkFunction);

  // Add all color and style properties as chainable methods
  const colors = ['bold', 'white', 'gray', 'yellow', 'green', 'blue', 'red', 'cyan', 'black', 'magenta'];

  colors.forEach(color => {
    mockFn[color] = vi.fn(createChalkFunction);
    // Make each color method also chainable
    colors.forEach(subColor => {
      mockFn[color][subColor] = vi.fn(createChalkFunction);
    });
  });

  return mockFn;
};

const chalkMock = createChainableMock();

vi.mock('chalk', () => ({
  default: chalkMock
}));

// Mock inquirer for CLI interactions
const inquirerMock = {
  prompt: vi.fn().mockResolvedValue({ confirm: true })
};

vi.mock('inquirer', () => ({
  default: inquirerMock,
  ...inquirerMock
}));

// Mock readline for CLI prompts
vi.mock('readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn((_prompt, callback) => {
      // Simulate async callback
      setTimeout(() => callback('test input'), 0);
    }),
    close: vi.fn()
  })
}));

// Mock ora spinner
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis()
  }))
}));

// Console mocking for testing output
const originalConsole = global.console;

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  // Mock console methods to avoid noise in tests
  global.console = {
    ...originalConsole,
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    clear: vi.fn()
  };
});

afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});

afterAll(() => {
  server.close();
  global.console = originalConsole;
});

// Test helper functions
export function createMockMessage(overrides: Partial<typeof mockMessages[0]> = {}) {
  return {
    id: 'mock-message-' + Date.now(),
    threadId: 'mock-thread-' + Date.now(),
    labelIds: ['INBOX'],
    snippet: 'Mock email snippet',
    payload: {
      headers: [
        { name: 'Subject', value: 'Mock Subject' },
        { name: 'From', value: 'mock@example.com' },
        { name: 'To', value: 'recipient@example.com' },
        { name: 'Date', value: new Date().toISOString() }
      ],
      body: {
        data: Buffer.from('Mock email body').toString('base64')
      }
    },
    ...overrides
  };
}

export function createMockLabel(overrides: Partial<typeof mockLabels[0]> = {}) {
  return {
    id: 'mock-label-' + Date.now(),
    name: 'Mock Label',
    type: 'user',
    ...overrides
  };
}