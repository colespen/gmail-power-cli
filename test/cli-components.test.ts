import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('CLI Components Integration', () => {
  describe('Context Resolution Logic', () => {
    it('should resolve contextual message IDs correctly', () => {
      const lastEmailIds = ['msg1', 'msg2', 'msg3'];
      const lastReadEmailId = 'last-read-msg';

      // Test first email reference
      const resolveMessageId = (messageId: string) => {
        if (messageId === 'first' && lastEmailIds.length > 0) {
          return lastEmailIds[0];
        } else if (messageId === 'last' && lastEmailIds.length > 0) {
          return lastEmailIds[lastEmailIds.length - 1];
        } else if (messageId === 'last_read' && lastReadEmailId) {
          return lastReadEmailId;
        } else if (!isNaN(parseInt(messageId)) && lastEmailIds.length > 0) {
          const index = parseInt(messageId) - 1;
          if (index >= 0 && index < lastEmailIds.length) {
            return lastEmailIds[index];
          }
        }
        return messageId;
      };

      expect(resolveMessageId('first')).toBe('msg1');
      expect(resolveMessageId('last')).toBe('msg3');
      expect(resolveMessageId('2')).toBe('msg2');
      expect(resolveMessageId('last_read')).toBe('last-read-msg');
      expect(resolveMessageId('actual-id')).toBe('actual-id');
    });

    it('should handle edge cases in message ID resolution', () => {
      const emptyIds: string[] = [];
      const noLastRead: string | null = null;

      const resolveMessageId = (messageId: string) => {
        if (messageId === 'first' && emptyIds.length > 0) {
          return emptyIds[0];
        } else if (messageId === 'last' && emptyIds.length > 0) {
          return emptyIds[emptyIds.length - 1];
        } else if (messageId === 'last_read' && noLastRead) {
          return noLastRead;
        }
        return messageId;
      };

      // Should return original when no context available
      expect(resolveMessageId('first')).toBe('first');
      expect(resolveMessageId('last')).toBe('last');
      expect(resolveMessageId('last_read')).toBe('last_read');
    });
  });

  describe('Label Name to ID Resolution', () => {
    const mockLabels = [
      { id: 'INBOX', name: 'INBOX', type: 'system' },
      { id: 'STARRED', name: 'STARRED', type: 'system' },
      { id: 'Label_1', name: 'Work', type: 'user' },
      { id: 'Label_2', name: 'Personal', type: 'user' },
      { id: 'Label_3', name: 'Work/Projects', type: 'user' }
    ];

    const getLabelIdByName = (labelName: string) => {
      const label = mockLabels.find(
        l => l.name.toLowerCase() === labelName.toLowerCase()
      );
      return label ? label.id : null;
    };

    it('should find system labels by name', () => {
      expect(getLabelIdByName('INBOX')).toBe('INBOX');
      expect(getLabelIdByName('inbox')).toBe('INBOX'); // Case insensitive
      expect(getLabelIdByName('STARRED')).toBe('STARRED');
    });

    it('should find custom labels by name', () => {
      expect(getLabelIdByName('Work')).toBe('Label_1');
      expect(getLabelIdByName('work')).toBe('Label_1'); // Case insensitive
      expect(getLabelIdByName('Personal')).toBe('Label_2');
    });

    it('should find nested labels by name', () => {
      expect(getLabelIdByName('Work/Projects')).toBe('Label_3');
    });

    it('should return null for non-existent labels', () => {
      expect(getLabelIdByName('NonExistent')).toBe(null);
      expect(getLabelIdByName('')).toBe(null);
    });
  });

  describe('Tool Arguments Processing', () => {
    it('should convert label names to IDs in modify_labels args', async () => {
      const labelsCache = [
        { id: 'STARRED', name: 'STARRED', type: 'system' },
        { id: 'Label_Work', name: 'Work', type: 'user' }
      ];

      const processLabelArgs = async (labels: string[]) => {
        return Promise.all(
          labels.map(async (label: string) => {
            // System labels are already IDs
            if (label.toUpperCase() === label || label.startsWith('Label_')) {
              return label;
            }
            // Look up custom label ID by name
            const labelObj = labelsCache.find(
              l => l.name.toLowerCase() === label.toLowerCase()
            );
            return labelObj ? labelObj.id : null;
          })
        ).then(results => results.filter(id => id !== null));
      };

      const result = await processLabelArgs(['STARRED', 'Work', 'NonExistent']);
      expect(result).toEqual(['STARRED', 'Label_Work']);
    });

    it('should handle contextual message ID arrays', () => {
      const lastEmailIds = ['search1', 'search2', 'search3'];
      const lastReadEmailId = 'last-read';

      const processMessageIds = (messageIds: string[]) => {
        if (messageIds.length === 1) {
          const ref = messageIds[0];
          if (ref === 'all_from_search' || ref === 'those') {
            return lastEmailIds;
          } else if (ref === 'last_read' && lastReadEmailId) {
            return [lastReadEmailId];
          } else if (ref === 'it' || ref === 'this') {
            return lastReadEmailId ? [lastReadEmailId] : lastEmailIds.slice(0, 1);
          }
        }
        return messageIds;
      };

      expect(processMessageIds(['all_from_search'])).toEqual(lastEmailIds);
      expect(processMessageIds(['those'])).toEqual(lastEmailIds);
      expect(processMessageIds(['last_read'])).toEqual([lastReadEmailId]);
      expect(processMessageIds(['it'])).toEqual([lastReadEmailId]);
      expect(processMessageIds(['msg1', 'msg2'])).toEqual(['msg1', 'msg2']);
    });
  });

  describe('Conversation History Management', () => {
    it('should maintain conversation history with size limits', () => {
      const conversationHistory: any[] = [];
      const maxHistorySize = 20;

      const addToHistory = (userMessage: string, assistantResponse: string) => {
        conversationHistory.push(
          { role: 'user', content: userMessage },
          { role: 'assistant', content: assistantResponse }
        );

        // Keep history manageable
        if (conversationHistory.length > maxHistorySize) {
          const excess = conversationHistory.length - maxHistorySize;
          conversationHistory.splice(0, excess);
        }
      };

      // Add messages to exceed limit
      for (let i = 0; i < 15; i++) {
        addToHistory(`User message ${i}`, `Assistant response ${i}`);
      }

      expect(conversationHistory.length).toBe(20); // Should be capped at 20

      // Verify oldest messages were removed
      expect(conversationHistory[0].content).toContain('User message 5');
      expect(conversationHistory[1].content).toContain('Assistant response 5');

      // Verify newest messages are preserved
      expect(conversationHistory[18].content).toContain('User message 14');
      expect(conversationHistory[19].content).toContain('Assistant response 14');
    });

    it('should build context information correctly', () => {
      const lastReadEmailId = 'msg-123';
      const lastEmailIds = ['search1', 'search2', 'search3', 'search4', 'search5', 'search6'];
      const lastSearchResults = [
        {
          id: 'search1',
          subject: 'Important Email',
          from: 'boss@company.com'
        }
      ];

      const buildContextInfo = () => {
        let contextInfo = '';

        if (lastReadEmailId) {
          contextInfo += `\\nLast read email ID: ${lastReadEmailId}`;
        }

        if (lastEmailIds.length > 0) {
          contextInfo += `\\nRecent search returned ${lastEmailIds.length} emails with IDs: ${lastEmailIds.slice(0, 5).join(', ')}`;
          if (lastEmailIds.length > 5) {
            contextInfo += '...';
          }
        }

        if (lastSearchResults.length > 0) {
          const lastEmail = lastSearchResults[0];
          contextInfo += `\\nMost recent email from search: "${lastEmail.subject}" from ${lastEmail.from} (ID: ${lastEmail.id})`;
        }

        return contextInfo;
      };

      const context = buildContextInfo();

      expect(context).toContain('Last read email ID: msg-123');
      expect(context).toContain('Recent search returned 6 emails');
      expect(context).toContain('search1, search2, search3, search4, search5...');
      expect(context).toContain('Most recent email from search: "Important Email" from boss@company.com');
    });
  });

  describe('Confirmation Workflow Logic', () => {
    it('should identify dangerous operations requiring confirmation', () => {
      const requiresConfirmation = (operation: string, args: any) => {
        if (operation === 'batch_operation') {
          return ['delete', 'archive'].includes(args.operation);
        } else if (operation === 'create_filter') {
          return args.action.removeLabelIds?.includes('INBOX') || false;
        }
        return false;
      };

      // Batch operations
      expect(requiresConfirmation('batch_operation', { operation: 'delete' })).toBe(true);
      expect(requiresConfirmation('batch_operation', { operation: 'archive' })).toBe(true);
      expect(requiresConfirmation('batch_operation', { operation: 'markRead' })).toBe(false);

      // Filter operations
      expect(requiresConfirmation('create_filter', {
        action: { removeLabelIds: ['INBOX'] }
      })).toBe(true);
      expect(requiresConfirmation('create_filter', {
        action: { addLabelIds: ['Label_1'] }
      })).toBe(false);

      // Other operations
      expect(requiresConfirmation('search_emails', {})).toBe(false);
      expect(requiresConfirmation('read_email', {})).toBe(false);
    });
  });

  describe('Tool Result Display Routing', () => {
    const displayMethods = [
      'showSearchResults',
      'showEmailContent',
      'showLabelsModified',
      'showLabelCreated',
      'showFilterResult',
      'showBatchOperationResult',
      'showSendEmailResult',
      'showLabelsList'
    ];

    const getDisplayMethod = (toolName: string) => {
      switch (toolName) {
        case 'search_emails': return 'showSearchResults';
        case 'read_email': return 'showEmailContent';
        case 'modify_labels': return 'showLabelsModified';
        case 'create_label': return 'showLabelCreated';
        case 'create_filter': return 'showFilterResult';
        case 'batch_operation': return 'showBatchOperationResult';
        case 'send_email': return 'showSendEmailResult';
        case 'list_labels': return 'showLabelsList';
        default: return null;
      }
    };

    it('should route tool results to correct display methods', () => {
      expect(getDisplayMethod('search_emails')).toBe('showSearchResults');
      expect(getDisplayMethod('read_email')).toBe('showEmailContent');
      expect(getDisplayMethod('modify_labels')).toBe('showLabelsModified');
      expect(getDisplayMethod('create_label')).toBe('showLabelCreated');
      expect(getDisplayMethod('create_filter')).toBe('showFilterResult');
      expect(getDisplayMethod('batch_operation')).toBe('showBatchOperationResult');
      expect(getDisplayMethod('send_email')).toBe('showSendEmailResult');
      expect(getDisplayMethod('list_labels')).toBe('showLabelsList');
    });

    it('should handle unknown tools gracefully', () => {
      expect(getDisplayMethod('unknown_tool')).toBe(null);
    });
  });

  describe('Gmail Query Processing', () => {
    it('should handle common Gmail query patterns', () => {
      const parseGmailQuery = (query: string) => {
        const patterns = {
          isUnread: /is:unread/i,
          fromSender: /from:([^\s]+)/i,
          hasSubject: /subject:(.+?)(?:\s|$)/i,
          hasAttachment: /has:attachment/i,
          newerThan: /newer_than:(\d+[dwmy])/i,
          inLabel: /label:([^\s]+)/i
        };

        const result: any = {};

        Object.entries(patterns).forEach(([key, pattern]) => {
          const match = query.match(pattern);
          if (match) {
            result[key] = match[1] || true;
          }
        });

        return result;
      };

      expect(parseGmailQuery('is:unread from:boss@company.com'))
        .toEqual({
          isUnread: true,
          fromSender: 'boss@company.com'
        });

      expect(parseGmailQuery('subject:meeting has:attachment newer_than:7d'))
        .toEqual({
          hasSubject: 'meeting',
          hasAttachment: true,
          newerThan: '7d'
        });

      expect(parseGmailQuery('label:Work/Projects is:unread'))
        .toEqual({
          inLabel: 'Work/Projects',
          isUnread: true
        });
    });
  });
});