import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLIDisplay } from '../src/cli-display.js';
import { EmailMessage, Label } from '../src/cli-messages.js';

describe('CLIDisplay', () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {})
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Search Results Display', () => {
    it('should display search results with proper formatting', () => {
      const searchResult = {
        messages: [
          {
            id: 'msg1',
            subject: 'Test Email 1',
            from: 'sender1@example.com',
            date: '2023-09-13 10:00:00',
            snippet: 'This is the first test email content for display testing',
            labelIds: ['INBOX', 'UNREAD']
          },
          {
            id: 'msg2',
            subject: 'Test Email 2',
            from: 'sender2@example.com',
            date: '2023-09-13 11:00:00',
            snippet: 'This is the second test email content',
            labelIds: ['INBOX']
          }
        ] as EmailMessage[],
        query: 'test query',
        total: 2
      };

      CLIDisplay.showSearchResults(searchResult);

      const logCalls = consoleSpy.log.mock.calls.flat();
      const output = logCalls.join('\n');

      // Check header
      expect(output).toContain('Found 2 emails');

      // Check first email
      expect(output).toContain('1. Test Email 1');
      expect(output).toContain('From: sender1@example.com');
      expect(output).toContain('Date: 2023-09-13 10:00:00');
      expect(output).toContain('Unread');
      expect(output).toContain('Preview: This is the first test email content for display testing...');

      // Check second email doesn't have unread indicator
      const email2StartIndex = output.indexOf('2. Test Email 2');
      const email2Section = output.substring(email2StartIndex);
      const nextEmailIndex = email2Section.indexOf('3.') > 0 ? email2Section.indexOf('3.') : email2Section.length;
      const email2Content = email2Section.substring(0, nextEmailIndex);

      expect(email2Content).not.toContain('📌 Unread');
    });

    it('should handle emails without subject', () => {
      const searchResult = {
        messages: [{
          id: 'msg1',
          from: 'sender@example.com',
          date: '2023-09-13',
          labelIds: ['INBOX']
        }] as EmailMessage[]
      };

      CLIDisplay.showSearchResults(searchResult);

      const output = consoleSpy.log.mock.calls.flat().join('\n');
      expect(output).toContain('(No subject)');
    });

    it('should truncate long snippets', () => {
      const longSnippet = 'a'.repeat(100);
      const searchResult = {
        messages: [{
          id: 'msg1',
          subject: 'Test',
          from: 'sender@example.com',
          snippet: longSnippet,
          labelIds: ['INBOX']
        }] as EmailMessage[]
      };

      CLIDisplay.showSearchResults(searchResult);

      const output = consoleSpy.log.mock.calls.flat().join('\n');
      expect(output).toContain('Preview: ' + 'a'.repeat(80) + '...');
    });

    it('should handle empty search results', () => {
      const emptyResult = {
        messages: [],
        query: 'no results query'
      };

      CLIDisplay.showSearchResults(emptyResult);

      const output = consoleSpy.log.mock.calls.flat().join('\n');
      expect(output).toContain('No emails found');
    });

    it('should show unread indicator for unread emails', () => {
      const searchResult = {
        messages: [{
          id: 'msg1',
          subject: 'Unread Email',
          from: 'sender@example.com',
          labelIds: ['INBOX', 'UNREAD']
        }] as EmailMessage[]
      };

      CLIDisplay.showSearchResults(searchResult);

      const output = consoleSpy.log.mock.calls.flat().join('\n');
      expect(output).toContain('📌 Unread');
    });
  });

  describe('Email Content Display', () => {
    it('should display full email content with headers', () => {
      const emailContent = {
        id: 'msg1',
        subject: 'Important Meeting',
        from: 'boss@company.com',
        to: 'employee@company.com',
        date: '2023-09-13 15:30:00',
        body: 'Please join the meeting at 3 PM today. We will discuss the quarterly results and future plans.',
        snippet: 'Meeting preview'
      };

      CLIDisplay.showEmailContent(emailContent);

      const output = consoleSpy.log.mock.calls.flat().join('\n');

      expect(output).toContain('📖 Email Content');
      expect(output).toContain('Subject: Important Meeting');
      expect(output).toContain('From: boss@company.com');
      expect(output).toContain('To: employee@company.com');
      expect(output).toContain('Date: 2023-09-13 15:30:00');
      expect(output).toContain('--- Message ---');
      expect(output).toContain('Please join the meeting at 3 PM today');
    });

    it('should handle missing email fields gracefully', () => {
      const emailContent = {
        id: 'msg1',
        body: 'Simple email body'
      };

      CLIDisplay.showEmailContent(emailContent);

      const output = consoleSpy.log.mock.calls.flat().join('\n');

      expect(output).toContain('Subject: (No subject)');
      expect(output).toContain('Simple email body');
    });

    it('should truncate very long email bodies', () => {
      const longBody = 'Very long email content. '.repeat(200); // > 2000 chars
      const emailContent = {
        id: 'msg1',
        subject: 'Long Email',
        body: longBody
      };

      CLIDisplay.showEmailContent(emailContent);

      const output = consoleSpy.log.mock.calls.flat().join('\n');

      expect(output).toContain(longBody.substring(0, 2000));
      expect(output).toContain('(truncated for display)');
    });

    it('should fallback to snippet when body is not available', () => {
      const emailContent = {
        id: 'msg1',
        subject: 'Test Email',
        snippet: 'This is the email snippet'
      };

      CLIDisplay.showEmailContent(emailContent);

      const output = consoleSpy.log.mock.calls.flat().join('\n');
      expect(output).toContain('This is the email snippet');
    });
  });

  describe('Label Operations Display', () => {
    it('should show labels modified confirmation', () => {
      const result = {
        modified: 3,
        messageIds: ['msg1', 'msg2', 'msg3']
      };

      CLIDisplay.showLabelsModified(result);

      const output = consoleSpy.log.mock.calls.flat().join('\n');

      expect(output).toContain('✅ Labels updated successfully');
      expect(output).toContain('Modified 3 emails');
    });

    it('should handle single email modification', () => {
      const result = {
        modified: 1
      };

      CLIDisplay.showLabelsModified(result);

      const output = consoleSpy.log.mock.calls.flat().join('\n');
      expect(output).toContain('Modified 1 email'); // Singular form
    });

    it('should show label created confirmation', () => {
      const result = {
        id: 'Label_123',
        name: 'New Work Label',
        type: 'user'
      };

      CLIDisplay.showLabelCreated(result);

      const output = consoleSpy.log.mock.calls.flat().join('\n');

      expect(output).toContain('✅ Label created successfully');
      expect(output).toContain('Label name: New Work Label');
    });

    it('should list all labels with proper formatting', () => {
      const labels: Label[] = [
        { id: 'INBOX', name: 'INBOX', type: 'system' },
        { id: 'Label_1', name: 'Work/Projects', type: 'user' },
        { id: 'Label_2', name: 'Personal' }
      ];

      CLIDisplay.showLabelsList(labels);

      const output = consoleSpy.log.mock.calls.flat().join('\n');

      expect(output).toContain('📋 Gmail Labels');
      expect(output).toContain('1. INBOX');
      expect(output).toContain('ID: INBOX');
      expect(output).toContain('Type: system');
      expect(output).toContain('2. Work/Projects');
      expect(output).toContain('ID: Label_1');
      expect(output).toContain('3. Personal');
    });

    it('should handle empty labels list', () => {
      CLIDisplay.showLabelsList([]);

      const output = consoleSpy.log.mock.calls.flat().join('\n');
      expect(output).toContain('No labels found');
    });
  });

  describe('Filter Operations Display', () => {
    it('should show filter creation result with details', () => {
      const result = {
        id: 'filter-123',
        criteria: {
          from: 'notifications@example.com',
          subject: 'Weekly Report'
        },
        action: {
          addLabelIds: ['Label_1', 'Label_2'],
          removeLabelIds: ['INBOX']
        }
      };

      CLIDisplay.showFilterResult(result);

      const output = consoleSpy.log.mock.calls.flat().join('\n');

      expect(output).toContain('✅ Filter created successfully');
      expect(output).toContain('Criteria:');
      expect(output).toContain('from: notifications@example.com');
      expect(output).toContain('subject: Weekly Report');
      expect(output).toContain('Actions:');
      expect(output).toContain('Apply labels: Label_1, Label_2');
      expect(output).toContain('Remove labels: INBOX');
    });

    it('should show cancelled filter creation', () => {
      const result = {
        cancelled: true
      };

      CLIDisplay.showFilterResult(result);

      const output = consoleSpy.log.mock.calls.flat().join('\n');
      expect(output).toContain('❌ Filter creation cancelled');
    });

    it('should list existing filters', () => {
      const filters = [
        {
          id: 'filter-1',
          criteria: { from: 'spam@example.com' },
          action: { removeLabelIds: ['INBOX'] }
        },
        {
          id: 'filter-2',
          criteria: { subject: 'Important' },
          action: { addLabelIds: ['IMPORTANT'] }
        }
      ];

      CLIDisplay.showFiltersList(filters);

      const output = consoleSpy.log.mock.calls.flat().join('\n');

      expect(output).toContain('📋 Gmail Filters');
      expect(output).toContain('1. Filter ID: filter-1');
      expect(output).toContain('2. Filter ID: filter-2');
      expect(output).toContain('from: spam@example.com');
      expect(output).toContain('subject: Important');
    });

    it('should handle empty filters list', () => {
      CLIDisplay.showFiltersList([]);

      const output = consoleSpy.log.mock.calls.flat().join('\n');
      expect(output).toContain('No filters found');
    });
  });

  describe('Batch Operations Display', () => {
    it('should show successful batch operation result', () => {
      const result = {
        operation: 'archive',
        affected: 12
      };

      CLIDisplay.showBatchOperationResult(result);

      const output = consoleSpy.log.mock.calls.flat().join('\n');

      expect(output).toContain('✅ Batch operation completed');
      expect(output).toContain('Operation: archive');
      expect(output).toContain('Affected 12 emails');
    });

    it('should show cancelled batch operation', () => {
      const result = {
        cancelled: true,
        operation: 'delete'
      };

      CLIDisplay.showBatchOperationResult(result);

      const output = consoleSpy.log.mock.calls.flat().join('\n');
      expect(output).toContain('❌ Batch delete cancelled');
    });

    it('should handle different operation types', () => {
      const operations = ['archive', 'delete', 'markRead', 'markUnread', 'star', 'unstar'];

      operations.forEach(operation => {
        consoleSpy.log.mockClear();

        CLIDisplay.showBatchOperationResult({
          operation,
          affected: 5
        });

        const output = consoleSpy.log.mock.calls.flat().join('\n');
        expect(output).toContain(`Operation: ${operation}`);
      });
    });
  });

  describe('Email Sending Display', () => {
    it('should show successful email send result', () => {
      const result = {
        id: 'sent-message-123',
        labelIds: ['SENT']
      };

      CLIDisplay.showSendEmailResult(result);

      const output = consoleSpy.log.mock.calls.flat().join('\n');

      expect(output).toContain('✅ Email sent successfully');
      expect(output).toContain('Message ID: sent-message-123');
    });

    it('should handle send result without ID', () => {
      const result = {};

      CLIDisplay.showSendEmailResult(result);

      const output = consoleSpy.log.mock.calls.flat().join('\n');
      expect(output).toContain('✅ Email sent successfully');
      expect(output).not.toContain('Message ID:');
    });
  });

  describe('Formatting and Visual Elements', () => {
    it('should use appropriate emojis for different operations', () => {
      // Search results
      CLIDisplay.showSearchResults({ messages: [{ id: '1' }] } as any);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('📧')
      );

      // Email content
      CLIDisplay.showEmailContent({ id: '1' });
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('📖')
      );

      // Labels list
      CLIDisplay.showLabelsList([]);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('📋')
      );

      // Success operations
      CLIDisplay.showLabelCreated({ name: 'Test' });
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('✅')
      );
    });

    it('should maintain consistent indentation', () => {
      const searchResult = {
        messages: [{
          id: 'msg1',
          subject: 'Test',
          from: 'sender@example.com',
          date: '2023-09-13',
          snippet: 'Test snippet'
        }]
      };

      CLIDisplay.showSearchResults(searchResult);

      const logCalls = consoleSpy.log.mock.calls;

      // Find calls with indentation
      const indentedCalls = logCalls.filter(call =>
        call[0] && typeof call[0] === 'string' && call[0].includes('   ')
      );

      expect(indentedCalls.length).toBeGreaterThan(0);
    });

    it('should handle undefined or null data gracefully', () => {
      expect(() => CLIDisplay.showSearchResults(null as any)).not.toThrow();
      expect(() => CLIDisplay.showEmailContent(null as any)).not.toThrow();
      expect(() => CLIDisplay.showLabelsList(null as any)).not.toThrow();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed search results', () => {
      const malformedResult = {
        messages: null,
        query: 'test'
      };

      expect(() => CLIDisplay.showSearchResults(malformedResult as any)).not.toThrow();
    });

    it('should handle very large numbers in results', () => {
      const result = {
        modified: 999999,
        affected: 1000000
      };

      expect(() => CLIDisplay.showLabelsModified(result)).not.toThrow();
      expect(() => CLIDisplay.showBatchOperationResult(result as any)).not.toThrow();
    });

    it('should handle special characters in email content', () => {
      const emailContent = {
        id: 'msg1',
        subject: 'Test 📧 with émojis and àccents',
        from: 'tëst@éxample.com',
        body: 'Email with special chars: 漢字 ñoño @#$%^&*()'
      };

      expect(() => CLIDisplay.showEmailContent(emailContent)).not.toThrow();

      const output = consoleSpy.log.mock.calls.flat().join('\n');
      expect(output).toContain('Test 📧 with émojis');
      expect(output).toContain('漢字 ñoño @#$%^&*()');
    });

    it('should handle missing nested properties', () => {
      const incompleteFilter = {
        id: 'filter-1',
        criteria: null,
        action: null
      };

      expect(() => CLIDisplay.showFilterResult(incompleteFilter)).not.toThrow();
    });

    it('should handle empty strings in display data', () => {
      const emptyData = {
        id: '',
        subject: '',
        from: '',
        body: '',
        name: ''
      };

      expect(() => CLIDisplay.showEmailContent(emptyData)).not.toThrow();
      expect(() => CLIDisplay.showLabelCreated(emptyData)).not.toThrow();
    });
  });
});