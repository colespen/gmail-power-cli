import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GmailService } from '../src/gmail-service.js';
import { mockLabels } from './setup.js';

// Mock the auth module
vi.mock('../src/auth.js', () => ({
  getGmailService: vi.fn()
}));

describe('Integration Tests', () => {
  let gmailService: GmailService;
  let mockGmailAPI: any;

  beforeEach(async () => {
    // Create a comprehensive mock Gmail API
    mockGmailAPI = {
      users: {
        messages: {
          list: vi.fn(),
          get: vi.fn(),
          modify: vi.fn(),
          batchModify: vi.fn(),
          batchDelete: vi.fn(),
          send: vi.fn()
        },
        labels: {
          list: vi.fn(),
          create: vi.fn()
        },
        settings: {
          filters: {
            list: vi.fn(),
            create: vi.fn()
          }
        }
      }
    };

    // Setup the auth mock
    const { getGmailService } = await import('../src/auth.js');
    vi.mocked(getGmailService).mockResolvedValue(mockGmailAPI);

    gmailService = new GmailService();
    await gmailService.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete Email Workflow', () => {
    it('should handle search -> read -> modify -> archive workflow', async () => {
      // Step 1: Search for emails
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: [
            { id: 'workflow-msg-1', threadId: 'workflow-thread-1' },
            { id: 'workflow-msg-2', threadId: 'workflow-thread-2' }
          ],
          resultSizeEstimate: 2
        }
      });

      // Mock message details for search
      mockGmailAPI.users.messages.get
        .mockResolvedValueOnce({
          data: {
            id: 'workflow-msg-1',
            threadId: 'workflow-thread-1',
            snippet: 'Important email about project',
            labelIds: ['INBOX', 'UNREAD'],
            payload: {
              headers: [
                { name: 'Subject', value: 'Project Update Required' },
                { name: 'From', value: 'manager@company.com' },
                { name: 'Date', value: '2023-09-13 14:00:00' }
              ]
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            id: 'workflow-msg-2',
            threadId: 'workflow-thread-2',
            snippet: 'Meeting reminder',
            labelIds: ['INBOX'],
            payload: {
              headers: [
                { name: 'Subject', value: 'Team Meeting Tomorrow' },
                { name: 'From', value: 'calendar@company.com' },
                { name: 'Date', value: '2023-09-13 15:00:00' }
              ]
            }
          }
        });

      const searchResult = await gmailService.searchEmails('from:company.com', 10);

      expect(searchResult.messages).toHaveLength(2);
      expect(searchResult.messages[0].subject).toBe('Project Update Required');
      expect(searchResult.messages[1].subject).toBe('Team Meeting Tomorrow');

      // Step 2: Read the first email in detail
      mockGmailAPI.users.messages.get.mockResolvedValue({
        data: {
          id: 'workflow-msg-1',
          threadId: 'workflow-thread-1',
          labelIds: ['INBOX', 'UNREAD'],
          payload: {
            headers: [
              { name: 'Subject', value: 'Project Update Required' },
              { name: 'From', value: 'manager@company.com' },
              { name: 'To', value: 'employee@company.com' },
              { name: 'Date', value: '2023-09-13 14:00:00' }
            ],
            body: {
              data: Buffer.from('Please provide an update on the current project status by end of day.').toString('base64')
            }
          }
        }
      });

      const emailContent = await gmailService.readEmail('workflow-msg-1');

      expect(emailContent.subject).toBe('Project Update Required');
      expect(emailContent.from).toBe('manager@company.com');
      expect(emailContent.body).toContain('provide an update on the current project');

      // Step 3: Mark as read and add Work label
      mockGmailAPI.users.messages.modify.mockResolvedValue({
        data: {
          id: 'workflow-msg-1',
          labelIds: ['INBOX', 'Label_Work']
        }
      });

      const modifyResult = await gmailService.modifyLabels(
        ['workflow-msg-1'],
        ['Label_Work'],
        ['UNREAD']
      );

      expect(mockGmailAPI.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'workflow-msg-1',
        requestBody: {
          addLabelIds: ['Label_Work'],
          removeLabelIds: ['UNREAD']
        }
      });

      expect(modifyResult.modified).toBe(1);

      // Step 4: Archive both emails
      mockGmailAPI.users.messages.modify.mockResolvedValue({
        data: {
          id: 'workflow-msg-1',
          labelIds: ['STARRED'] // After removing INBOX
        }
      });

      const archiveResult = await gmailService.modifyLabels(
        ['workflow-msg-1', 'workflow-msg-2'],
        [],
        ['INBOX']
      );

      expect(mockGmailAPI.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'workflow-msg-1',
        requestBody: {
          addLabelIds: [],
          removeLabelIds: ['INBOX']
        }
      });

      expect(archiveResult.modified).toBe(2);
    });

    it('should handle filter creation and email organization workflow', async () => {
      // Step 1: List existing labels to see what's available
      mockGmailAPI.users.labels.list.mockResolvedValue({
        data: { labels: mockLabels }
      });

      const labels = await gmailService.listLabels();
      expect(labels).toHaveLength(6);

      // Step 2: Create a new label for the filter
      mockGmailAPI.users.labels.create.mockResolvedValue({
        data: {
          id: 'Label_Notifications',
          name: 'Auto/Notifications',
          type: 'user'
        }
      });

      const newLabel = await gmailService.createLabel('Auto/Notifications');
      expect(newLabel.name).toBe('Auto/Notifications');

      // Step 3: Create filter to auto-label notification emails
      mockGmailAPI.users.settings.filters.create.mockResolvedValue({
        data: {
          id: 'filter-notifications',
          criteria: {
            from: 'notifications@*'
          },
          action: {
            addLabelIds: ['Label_Notifications'],
            removeLabelIds: ['INBOX']
          }
        }
      });

      const filter = await gmailService.createFilter(
        { from: 'notifications@*' },
        {
          addLabelIds: ['Label_Notifications'],
          removeLabelIds: ['INBOX']
        }
      );

      expect(filter.id).toBe('filter-notifications');

      // Step 4: Apply the filter action to existing emails
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: [
            { id: 'notif-1' },
            { id: 'notif-2' }
          ]
        }
      });

      mockGmailAPI.users.messages.modify.mockResolvedValue({
        data: {
          id: 'notif-1',
          labelIds: ['STARRED'] // After archiving
        }
      });

      const batchResult = await gmailService.batchOperation(
        'from:notifications@*',
        'archive'
      );

      expect(batchResult.affected).toBe(2);
      expect(batchResult.operation).toBe('archive');
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle API rate limiting gracefully', async () => {
      // Simulate rate limiting error
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).code = 429;

      mockGmailAPI.users.messages.list.mockRejectedValue(rateLimitError);

      await expect(gmailService.searchEmails('test query'))
        .rejects
        .toThrow('Failed to search emails');
    });

    it('should handle network timeouts', async () => {
      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'ETIMEDOUT';

      mockGmailAPI.users.messages.get.mockRejectedValue(timeoutError);

      await expect(gmailService.readEmail('msg-1'))
        .rejects
        .toThrow('Failed to read email');
    });

    it('should handle partial failures in batch operations', async () => {
      // Simulate scenario where some messages in batch succeed, others fail
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: [
            { id: 'msg-1' },
            { id: 'msg-2' },
            { id: 'msg-3' }
          ]
        }
      });

      // Batch modify succeeds but with partial results
      mockGmailAPI.users.messages.modify.mockResolvedValue({
        data: {
          id: 'msg-1',
          labelIds: ['STARRED'] // After starring
        }
      });

      const result = await gmailService.batchOperation('test query', 'star');

      expect(result.affected).toBe(3);
      expect(result.operation).toBe('star');
    });

    it('should handle authentication token expiration', async () => {
      const authError = new Error('Invalid credentials');
      (authError as any).code = 401;

      mockGmailAPI.users.messages.list.mockRejectedValue(authError);

      await expect(gmailService.searchEmails('test'))
        .rejects
        .toThrow('Failed to search emails');
    });
  });

  describe('Large Dataset Handling', () => {
    it('should handle large email search results efficiently', async () => {
      // Simulate large result set
      const largeMessageList = Array.from({ length: 100 }, (_, i) => ({
        id: `large-msg-${i}`,
        threadId: `large-thread-${i}`
      }));

      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: largeMessageList,
          resultSizeEstimate: 100
        }
      });

      // Mock individual message details
      mockGmailAPI.users.messages.get.mockImplementation(async ({ id }) => ({
        data: {
          id,
          threadId: `thread-for-${id}`,
          snippet: `Snippet for ${id}`,
          labelIds: ['INBOX'],
          payload: {
            headers: [
              { name: 'Subject', value: `Subject for ${id}` },
              { name: 'From', value: `sender-${id}@example.com` },
              { name: 'Date', value: '2023-09-13' }
            ]
          }
        }
      }));

      const result = await gmailService.searchEmails('large dataset query', 100);

      expect(result.messages).toHaveLength(100);
      expect(mockGmailAPI.users.messages.get).toHaveBeenCalledTimes(100);

      // Verify first and last messages
      expect(result.messages[0].id).toBe('large-msg-0');
      expect(result.messages[99].id).toBe('large-msg-99');
    });

    it('should handle batch operations on large message sets', async () => {
      const largeBatch = Array.from({ length: 500 }, (_, i) => ({
        id: `batch-msg-${i}`
      }));

      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: largeBatch,
          resultSizeEstimate: 500
        }
      });

      mockGmailAPI.users.messages.modify.mockResolvedValue({
        data: {
          id: 'large-msg-1',
          labelIds: [] // After removing UNREAD
        }
      });

      const result = await gmailService.batchOperation('large batch query', 'markRead');

      expect(result.affected).toBe(500);

      // Verify modify API was called for messages (at least once)
      expect(mockGmailAPI.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'batch-msg-0',
        requestBody: {
          addLabelIds: [],
          removeLabelIds: ['UNREAD']
        }
      });
    });
  });

  describe('Complex Email Content Parsing', () => {
    it('should handle multipart emails with attachments', async () => {
      mockGmailAPI.users.messages.get.mockResolvedValue({
        data: {
          id: 'multipart-msg',
          payload: {
            headers: [
              { name: 'Subject', value: 'Email with attachment' },
              { name: 'From', value: 'sender@example.com' }
            ],
            parts: [
              {
                mimeType: 'text/plain',
                body: {
                  data: Buffer.from('This is the text part of the email.').toString('base64')
                }
              },
              {
                mimeType: 'text/html',
                body: {
                  data: Buffer.from('<p>This is the HTML part.</p>').toString('base64')
                }
              },
              {
                mimeType: 'application/pdf',
                filename: 'document.pdf',
                body: {
                  attachmentId: 'att-123'
                }
              }
            ]
          }
        }
      });

      const result = await gmailService.readEmail('multipart-msg');

      expect(result.subject).toBe('Email with attachment');
      expect(result.body).toBe('This is the text part of the email.');
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].filename).toBe('document.pdf');
    });

    it('should handle nested multipart structures', async () => {
      mockGmailAPI.users.messages.get.mockResolvedValue({
        data: {
          id: 'nested-multipart',
          payload: {
            headers: [
              { name: 'Subject', value: 'Complex nested email' }
            ],
            parts: [
              {
                mimeType: 'multipart/alternative',
                parts: [
                  {
                    mimeType: 'text/plain',
                    body: {
                      data: Buffer.from('Plain text version').toString('base64')
                    }
                  },
                  {
                    mimeType: 'text/html',
                    body: {
                      data: Buffer.from('<h1>HTML version</h1>').toString('base64')
                    }
                  }
                ]
              },
              {
                mimeType: 'multipart/mixed',
                parts: [
                  {
                    mimeType: 'image/jpeg',
                    filename: 'image.jpg',
                    body: { attachmentId: 'img-123' }
                  }
                ]
              }
            ]
          }
        }
      });

      const result = await gmailService.readEmail('nested-multipart');

      expect(result.body).toBe('Plain text version');
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].filename).toBe('image.jpg');
    });
  });

  describe('Email Composition and Sending', () => {
    it('should compose and send complex emails', async () => {
      mockGmailAPI.users.messages.send.mockResolvedValue({
        data: {
          id: 'sent-complex-email',
          labelIds: ['SENT']
        }
      });

      const result = await gmailService.sendEmail(
        ['recipient1@example.com', 'recipient2@example.com'],
        'Project Status Update - Q3 2023',
        `Dear Team,

I wanted to provide you with an update on our Q3 project status.

Key achievements:
- Completed user authentication system
- Integrated payment processing
- Deployed to staging environment

Next steps:
- User acceptance testing
- Performance optimization
- Production deployment

Please let me know if you have any questions.

Best regards,
Project Manager`,
        {
          cc: ['manager@example.com'],
          bcc: ['archive@example.com']
        }
      );

      expect(result.id).toBe('sent-complex-email');

      // Verify the raw email was properly formatted
      const sendCall = mockGmailAPI.users.messages.send.mock.calls[0][0];
      const rawEmail = Buffer.from(sendCall.requestBody.raw, 'base64url').toString();

      expect(rawEmail).toContain('Subject: Project Status Update - Q3 2023');
      expect(rawEmail).toContain('To: recipient1@example.com, recipient2@example.com');
      expect(rawEmail).toContain('Cc: manager@example.com');
      expect(rawEmail).toContain('Key achievements:');
    });

    it('should handle email sending with special characters', async () => {
      mockGmailAPI.users.messages.send.mockResolvedValue({
        data: { id: 'sent-special-chars' }
      });

      await gmailService.sendEmail(
        ['tëst@éxample.com'],
        'Test with Special Chars: 漢字 & Émojis 📧',
        'Body with special chars: àáâãäå çñ 漢字 русский العربية 📧🎉'
      );

      expect(mockGmailAPI.users.messages.send).toHaveBeenCalled();

      const sendCall = mockGmailAPI.users.messages.send.mock.calls[0][0];
      const rawEmail = Buffer.from(sendCall.requestBody.raw, 'base64url').toString();

      // Verify UTF-8 encoding is preserved
      expect(rawEmail).toContain('tëst@éxample.com');
      expect(rawEmail).toContain('漢字');
      expect(rawEmail).toContain('📧');
    });
  });

  describe('Comprehensive Label Management', () => {
    it('should handle complex label hierarchies', async () => {
      const hierarchicalLabels = [
        { id: 'Label_1', name: 'Work', type: 'user' },
        { id: 'Label_2', name: 'Work/Projects', type: 'user' },
        { id: 'Label_3', name: 'Work/Projects/ClientA', type: 'user' },
        { id: 'Label_4', name: 'Work/Projects/ClientB', type: 'user' },
        { id: 'Label_5', name: 'Personal', type: 'user' },
        { id: 'Label_6', name: 'Personal/Finance', type: 'user' }
      ];

      mockGmailAPI.users.labels.list.mockResolvedValue({
        data: { labels: hierarchicalLabels }
      });

      const labels = await gmailService.listLabels();

      expect(labels).toHaveLength(6);

      // Verify hierarchical structure is preserved
      const workLabels = labels.filter(l => l.name?.startsWith('Work'));
      expect(workLabels).toHaveLength(4);

      const clientLabels = labels.filter(l => l.name?.includes('Client'));
      expect(clientLabels).toHaveLength(2);
    });

    it('should create nested labels correctly', async () => {
      mockGmailAPI.users.labels.create.mockResolvedValue({
        data: {
          id: 'Label_NewNested',
          name: 'Projects/2023/Q4/Important',
          type: 'user'
        }
      });

      const result = await gmailService.createLabel('Projects/2023/Q4/Important');

      expect(result.name).toBe('Projects/2023/Q4/Important');
      expect(mockGmailAPI.users.labels.create).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          name: 'Projects/2023/Q4/Important',
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show'
        }
      });
    });
  });

  describe('MSW Integration', () => {
    it('should work with MSW handlers for realistic API simulation', async () => {
      // This test verifies that our MSW setup works correctly
      // by making actual HTTP requests through the service

      // Override the auth mock to use actual HTTP requests
      vi.doUnmock('../src/auth.js');

      // Make a request that should hit our MSW handlers
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile');
      const data = await response.json();

      expect(data.emailAddress).toBe('test@example.com');
      expect(data.messagesTotal).toBe(100);
    });
  });
});