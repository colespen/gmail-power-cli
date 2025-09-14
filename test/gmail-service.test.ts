import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GmailService } from '../src/gmail-service.js';
import { mockLabels } from './setup.js';

// Mock the auth module first
vi.mock('../src/auth.js', () => ({
  getGmailService: vi.fn()
}));

describe('GmailService', () => {
  let gmailService: GmailService;
  let mockGmailAPI: any;

  beforeEach(async () => {
    // Create a properly typed mock for Gmail API
    mockGmailAPI = {
      users: {
        messages: {
          list: vi.fn(),
          get: vi.fn(),
          modify: vi.fn(),
          batchModify: vi.fn(),
          batchDelete: vi.fn(),
          send: vi.fn(),
          trash: vi.fn()
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

    // Setup default mock responses
    mockGmailAPI.users.messages.list.mockResolvedValue({ data: { messages: [] } });
    mockGmailAPI.users.messages.get.mockResolvedValue({ data: {} });
    mockGmailAPI.users.messages.modify.mockResolvedValue({ data: { labelIds: [] } });
    mockGmailAPI.users.messages.batchModify.mockResolvedValue({ data: {} });
    mockGmailAPI.users.messages.batchDelete.mockResolvedValue({ data: {} });
    mockGmailAPI.users.messages.send.mockResolvedValue({ data: { id: 'test', labelIds: ['SENT'] } });
    mockGmailAPI.users.messages.trash.mockResolvedValue({ data: {} });
    mockGmailAPI.users.labels.list.mockResolvedValue({ data: { labels: [] } });
    mockGmailAPI.users.labels.create.mockResolvedValue({ data: { id: 'test', name: 'test' } });
    mockGmailAPI.users.settings.filters.list.mockResolvedValue({ data: { filter: [] } });
    mockGmailAPI.users.settings.filters.create.mockResolvedValue({ data: { id: 'test' } });

    // Setup the auth mock to return our Gmail API mock
    const { getGmailService } = await import('../src/auth.js');
    vi.mocked(getGmailService).mockResolvedValue(mockGmailAPI);

    gmailService = new GmailService();
    await gmailService.initialize();
  });

  describe('Email Search', () => {
    it('should search emails successfully', async () => {
      // Setup Gmail API mock
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: [
            { id: 'test-message-1', threadId: 'test-thread-1' },
            { id: 'test-message-2', threadId: 'test-thread-2' }
          ],
          resultSizeEstimate: 2
        }
      });

      // Mock message details
      mockGmailAPI.users.messages.get
        .mockResolvedValueOnce({
          data: {
            id: 'test-message-1',
            threadId: 'test-thread-1',
            snippet: 'Test email snippet 1',
            labelIds: ['INBOX', 'UNREAD'],
            payload: {
              headers: [
                { name: 'Subject', value: 'Test Subject 1' },
                { name: 'From', value: 'sender1@example.com' },
                { name: 'To', value: 'recipient@example.com' },
                { name: 'Date', value: 'Wed, 13 Sep 2023 10:00:00 -0700' }
              ]
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            id: 'test-message-2',
            threadId: 'test-thread-2',
            snippet: 'Test email snippet 2',
            labelIds: ['INBOX'],
            payload: {
              headers: [
                { name: 'Subject', value: 'Test Subject 2' },
                { name: 'From', value: 'sender2@example.com' },
                { name: 'To', value: 'recipient@example.com' },
                { name: 'Date', value: 'Wed, 13 Sep 2023 11:00:00 -0700' }
              ]
            }
          }
        });

      const result = await gmailService.searchEmails('is:unread', 10);

      expect(mockGmailAPI.users.messages.list).toHaveBeenCalledWith({
        userId: 'me',
        q: 'is:unread',
        maxResults: 10
      });

      expect(result.messages).toHaveLength(2);
      expect(result.query).toBe('is:unread');
      expect(result.total).toBe(2);

      expect(result.messages[0]).toMatchObject({
        id: 'test-message-1',
        threadId: 'test-thread-1',
        subject: 'Test Subject 1',
        from: 'sender1@example.com',
        snippet: 'Test email snippet 1'
      });
    });

    it('should handle empty search results', async () => {
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {}
      });

      const result = await gmailService.searchEmails('nonexistent query');

      expect(result.messages).toEqual([]);
      expect(result.query).toBe('nonexistent query');
    });

    it('should handle search errors', async () => {
      mockGmailAPI.users.messages.list.mockRejectedValue(new Error('API Error'));

      await expect(gmailService.searchEmails('test query'))
        .rejects
        .toThrow('Failed to search emails');
    });

    it('should respect maxResults parameter', async () => {
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: [
            { id: 'test-message-1', threadId: 'test-thread-1' }
          ],
          resultSizeEstimate: 1
        }
      });

      mockGmailAPI.users.messages.get.mockResolvedValue({
        data: {
          id: 'test-message-1',
          threadId: 'test-thread-1',
          snippet: 'Test snippet',
          payload: { headers: [] }
        }
      });

      await gmailService.searchEmails('test', 5);

      expect(mockGmailAPI.users.messages.list).toHaveBeenCalledWith({
        userId: 'me',
        q: 'test',
        maxResults: 5
      });
    });
  });

  describe('Email Reading', () => {
    it('should read email content successfully', async () => {
      mockGmailAPI.users.messages.get.mockResolvedValue({
        data: {
          id: 'test-message-1',
          threadId: 'test-thread-1',
          snippet: 'Test snippet',
          labelIds: ['INBOX'],
          payload: {
            headers: [
              { name: 'Subject', value: 'Test Email Subject' },
              { name: 'From', value: 'sender@example.com' },
              { name: 'To', value: 'recipient@example.com' },
              { name: 'Date', value: 'Wed, 13 Sep 2023 10:00:00 -0700' }
            ],
            body: {
              data: Buffer.from('Test email body content').toString('base64')
            }
          }
        }
      });

      const result = await gmailService.readEmail('test-message-1');

      expect(mockGmailAPI.users.messages.get).toHaveBeenCalledWith({
        userId: 'me',
        id: 'test-message-1',
        format: 'full'
      });

      expect(result).toMatchObject({
        id: 'test-message-1',
        threadId: 'test-thread-1',
        subject: 'Test Email Subject',
        from: 'sender@example.com',
        to: 'recipient@example.com',
        body: 'Test email body content'
      });
    });

    it('should handle multipart email content', async () => {
      mockGmailAPI.users.messages.get.mockResolvedValue({
        data: {
          id: 'test-message-1',
          payload: {
            headers: [
              { name: 'Subject', value: 'Multipart Email' }
            ],
            parts: [
              {
                mimeType: 'text/plain',
                body: {
                  data: Buffer.from('Plain text part').toString('base64')
                }
              },
              {
                mimeType: 'text/html',
                body: {
                  data: Buffer.from('<p>HTML part</p>').toString('base64')
                }
              }
            ]
          }
        }
      });

      const result = await gmailService.readEmail('test-message-1');

      expect(result.body).toBe('Plain text part');
    });

    it('should handle read email errors', async () => {
      mockGmailAPI.users.messages.get.mockRejectedValue(new Error('Message not found'));

      await expect(gmailService.readEmail('invalid-id'))
        .rejects
        .toThrow('Failed to read email');
    });
  });

  describe('Label Management', () => {
    it('should list labels successfully', async () => {
      mockGmailAPI.users.labels.list.mockResolvedValue({
        data: {
          labels: mockLabels
        }
      });

      const result = await gmailService.listLabels();

      expect(mockGmailAPI.users.labels.list).toHaveBeenCalledWith({
        userId: 'me'
      });

      expect(result).toHaveLength(6);
      expect(result[0]).toMatchObject({
        id: 'INBOX',
        name: 'INBOX',
        type: 'system'
      });
    });

    it('should create label successfully', async () => {
      const newLabel = {
        id: 'Label_123',
        name: 'New Test Label',
        type: 'user'
      };

      mockGmailAPI.users.labels.create.mockResolvedValue({
        data: newLabel
      });

      const result = await gmailService.createLabel('New Test Label');

      expect(mockGmailAPI.users.labels.create).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          name: 'New Test Label',
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show'
        }
      });

      expect(result).toEqual(newLabel);
    });

    it('should handle nested label names', async () => {
      const nestedLabel = {
        id: 'Label_456',
        name: 'Work/Projects',
        type: 'user'
      };

      mockGmailAPI.users.labels.create.mockResolvedValue({
        data: nestedLabel
      });

      const result = await gmailService.createLabel('Work/Projects');

      expect(result.name).toBe('Work/Projects');
    });

    it('should handle label creation errors', async () => {
      mockGmailAPI.users.labels.create.mockRejectedValue(new Error('Label already exists'));

      await expect(gmailService.createLabel('Existing Label'))
        .rejects
        .toThrow('Failed to create label');
    });

    it('should modify email labels successfully', async () => {
      mockGmailAPI.users.messages.modify.mockResolvedValue({
        data: {
          id: 'test-message-1',
          labelIds: ['INBOX', 'STARRED']
        }
      });

      const result = await gmailService.modifyLabels(
        ['test-message-1'],
        ['STARRED'],
        ['UNREAD']
      );

      expect(mockGmailAPI.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'test-message-1',
        requestBody: {
          addLabelIds: ['STARRED'],
          removeLabelIds: ['UNREAD']
        }
      });

      expect(result.modified).toBe(1);
    });

    it('should handle batch label modifications', async () => {
      mockGmailAPI.users.messages.modify.mockResolvedValue({
        data: { labelIds: ['STARRED'] }
      });

      const messageIds = ['msg1', 'msg2', 'msg3'];
      const result = await gmailService.modifyLabels(
        messageIds,
        ['STARRED'],
        ['UNREAD']
      );

      expect(mockGmailAPI.users.messages.modify).toHaveBeenCalledTimes(messageIds.length);
      expect(mockGmailAPI.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: expect.any(String),
        requestBody: {
          addLabelIds: ['STARRED'],
          removeLabelIds: ['UNREAD']
        }
      });

      expect(result.modified).toBe(messageIds.length);
    });
  });

  describe('Email Sending', () => {
    it('should send email successfully', async () => {
      const sentMessage = {
        id: 'sent-message-123',
        labelIds: ['SENT']
      };

      mockGmailAPI.users.messages.send.mockResolvedValue({
        data: sentMessage
      });

      const result = await gmailService.sendEmail(
        ['recipient@example.com'],
        'Test Subject',
        'Test Body'
      );

      expect(mockGmailAPI.users.messages.send).toHaveBeenCalled();
      expect(result).toEqual({
        id: 'sent-message-123',
        threadId: undefined,
        labelIds: ['SENT'],
        success: true
      });
    });

    it('should send email with CC recipients', async () => {
      mockGmailAPI.users.messages.send.mockResolvedValue({
        data: { id: 'sent-123', labelIds: ['SENT'] }
      });

      await gmailService.sendEmail(
        ['to@example.com'],
        'Test Subject',
        'Test Body',
        { cc: ['cc@example.com'] }
      );

      expect(mockGmailAPI.users.messages.send).toHaveBeenCalled();

      // Verify that the raw email contains CC header
      const callArgs = mockGmailAPI.users.messages.send.mock.calls[0][0];
      const rawEmail = Buffer.from(callArgs.requestBody.raw, 'base64url').toString();
      expect(rawEmail).toContain('cc@example.com');
    });

    it('should handle email sending errors', async () => {
      mockGmailAPI.users.messages.send.mockRejectedValue(new Error('Send failed'));

      await expect(
        gmailService.sendEmail(['test@example.com'], 'Subject', 'Body')
      ).rejects.toThrow('Failed to send email');
    });
  });

  describe('Batch Operations', () => {
    it('should perform batch archive operation', async () => {
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: [
            { id: 'msg1', threadId: 'thread1' },
            { id: 'msg2', threadId: 'thread2' }
          ]
        }
      });

      mockGmailAPI.users.messages.batchModify.mockResolvedValue({
        data: {}
      });

      const result = await gmailService.batchOperation('is:unread', 'archive');

      expect(mockGmailAPI.users.messages.list).toHaveBeenCalledWith({
        userId: 'me',
        q: 'is:unread',
        maxResults: 100
      });

      // Archive operation calls modifyLabels which uses individual modify calls
      expect(mockGmailAPI.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: expect.any(String),
        requestBody: {
          addLabelIds: [],
          removeLabelIds: ['INBOX']
        }
      });

      expect(result.affected).toBe(2);
      expect(result.operation).toBe('archive');
    });

    it('should perform batch delete operation', async () => {
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: [{ id: 'msg1' }]
        }
      });

      const result = await gmailService.batchOperation('old emails', 'delete');

      // Delete operation uses individual trash calls
      expect(mockGmailAPI.users.messages.trash).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg1'
      });

      expect(result.affected).toBe(1);
      expect(result.operation).toBe('delete');
    });

    it('should perform batch star operation', async () => {
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: [{ id: 'msg1' }, { id: 'msg2' }]
        }
      });

      mockGmailAPI.users.messages.batchModify.mockResolvedValue({
        data: {}
      });

      await gmailService.batchOperation('important emails', 'star');

      // Star operation calls modifyLabels which uses individual modify calls
      expect(mockGmailAPI.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: expect.any(String),
        requestBody: {
          addLabelIds: ['STARRED'],
          removeLabelIds: []
        }
      });
    });

    it('should handle empty batch operations', async () => {
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {}
      });

      const result = await gmailService.batchOperation('nonexistent', 'archive');

      expect(result.affected).toBe(0);
    });
  });

  describe('Filter Management', () => {
    it('should create filter successfully', async () => {
      const newFilter = {
        id: 'filter-123',
        criteria: { from: 'test@example.com' },
        action: { addLabelIds: ['Label_1'] }
      };

      mockGmailAPI.users.settings.filters.create.mockResolvedValue({
        data: newFilter
      });

      const criteria = { from: 'test@example.com' };
      const action = { addLabelIds: ['Label_1'] };

      const result = await gmailService.createFilter(criteria, action);

      expect(mockGmailAPI.users.settings.filters.create).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          criteria,
          action
        }
      });

      expect(result).toEqual(newFilter);
    });

    it('should list filters successfully', async () => {
      const filters = [
        {
          id: 'filter-1',
          criteria: { from: 'notifications@example.com' },
          action: { addLabelIds: ['Label_1'] }
        }
      ];

      mockGmailAPI.users.settings.filters.list.mockResolvedValue({
        data: { filter: filters }
      });

      const result = await gmailService.listFilters();

      expect(mockGmailAPI.users.settings.filters.list).toHaveBeenCalledWith({
        userId: 'me'
      });

      expect(result).toEqual(filters);
    });

    it('should handle filter creation errors', async () => {
      mockGmailAPI.users.settings.filters.create.mockRejectedValue(
        new Error('Invalid criteria')
      );

      await expect(
        gmailService.createFilter({ from: '' }, { addLabelIds: [] })
      ).rejects.toThrow('Failed to create filter');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when not initialized', async () => {
      const uninitializedService = new GmailService();

      await expect(uninitializedService.searchEmails('test'))
        .rejects
        .toThrow('GmailService not initialized');
    });

    it('should handle API rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      mockGmailAPI.users.messages.list.mockRejectedValue(rateLimitError);

      await expect(gmailService.searchEmails('test'))
        .rejects
        .toThrow('Failed to search emails');
    });

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network timeout');
      mockGmailAPI.users.labels.list.mockRejectedValue(networkError);

      await expect(gmailService.listLabels())
        .rejects
        .toThrow('Failed to list labels');
    });
  });
});