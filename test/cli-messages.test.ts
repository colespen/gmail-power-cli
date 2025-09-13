import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import chalk from 'chalk';
import * as readline from 'readline';

// Mock dependencies
vi.mock('chalk', () => {
  const createChalkFunction = (text: string) => `[MOCK]${text}[/MOCK]`;
  const chalkMock = {
    bold: Object.assign(vi.fn(createChalkFunction), {
      green: vi.fn(createChalkFunction),
      white: vi.fn(createChalkFunction),
      yellow: vi.fn(createChalkFunction),
      red: vi.fn(createChalkFunction),
      blue: vi.fn(createChalkFunction),
      cyan: vi.fn(createChalkFunction)
    }),
    green: vi.fn(createChalkFunction),
    cyan: vi.fn(createChalkFunction),
    gray: vi.fn(createChalkFunction),
    yellow: vi.fn(createChalkFunction),
    red: vi.fn(createChalkFunction),
    white: vi.fn(createChalkFunction),
    blue: vi.fn(createChalkFunction)
  };
  return { default: chalkMock };
});

vi.mock('inquirer', () => {
  const inquirerMock = {
    prompt: vi.fn().mockResolvedValue({ confirm: false })
  };
  return {
    default: inquirerMock,
    ...inquirerMock
  };
});

vi.mock('readline', () => ({
  createInterface: vi.fn()
}));

import { CLIMessages } from '../src/cli-messages.js';

describe('CLIMessages', () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      clear: vi.spyOn(console, 'clear').mockImplementation(() => {})
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Welcome and Startup Messages', () => {
    it('should display welcome message with proper formatting', () => {
      CLIMessages.showWelcome();

      expect(consoleSpy.clear).toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Gmail AI Assistant')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Powered by Groq (Llama 3.3)')
      );
    });

    it('should show Gmail connected message', () => {
      CLIMessages.showGmailConnected();

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Connected to Gmail')
      );
    });

    it('should show Gmail authentication needed message', () => {
      CLIMessages.showGmailAuthNeeded();

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Gmail auth needed')
      );
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('npm run auth')
      );
    });

    it('should show API key error with instructions', () => {
      CLIMessages.showApiKeyError();

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('GROQ_API_KEY environment variable not set')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('https://console.groq.com')
      );
    });

    it('should show goodbye message', () => {
      CLIMessages.showGoodbye();

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Goodbye!')
      );
    });

    it('should clear screen and show compact header', () => {
      CLIMessages.showClearScreen();

      expect(consoleSpy.clear).toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Gmail AI Assistant')
      );
    });
  });

  describe('Message Display', () => {
    it('should show error messages with proper formatting', () => {
      const errorMessage = 'Test error message';

      CLIMessages.showError(errorMessage);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining(`Error: ${errorMessage}`)
      );
    });

    it('should show warning messages', () => {
      const warningMessage = 'Test warning';

      CLIMessages.showWarning(warningMessage);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining(`Warning: ${warningMessage}`)
      );
    });

    it('should show rate limit information', () => {
      CLIMessages.showRateLimit();

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Groq service tier')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Limit 100000')
      );
    });

    it('should show debug information with formatted args', () => {
      const toolName = 'search_emails';
      const args = { query: 'is:unread', maxResults: 10 };

      CLIMessages.showDebugInfo(toolName, args);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining(`Debug: ${toolName} args:`)
      );
    });

    it('should show assistant response', () => {
      const response = 'Here are your emails';

      CLIMessages.showAssistantResponse(response);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining(response)
      );
    });
  });

  describe('Help System', () => {
    it('should display comprehensive help information', () => {
      CLIMessages.showHelp();

      const helpCalls = consoleSpy.log.mock.calls.flat();
      const helpText = helpCalls.join(' ');

      // Check for main sections
      expect(helpText).toContain('Gmail AI Assistant - Help');
      expect(helpText).toContain('Natural Language Examples');
      expect(helpText).toContain('Context-aware commands');
      expect(helpText).toContain('Commands:');

      // Check for specific examples
      expect(helpText).toContain('Show my unread emails');
      expect(helpText).toContain('Create a label called Work/Shopify');
      expect(helpText).toContain('Archive all promotional emails');

      // Check for context examples
      expect(helpText).toContain('move it to Work');
      expect(helpText).toContain('mark them all as read');

      // Check for commands
      expect(helpText).toContain('clear - Clear the screen');
      expect(helpText).toContain('help - Show this help message');
      expect(helpText).toContain('exit - Quit the assistant');
    });
  });

  describe('User Input', () => {
    it('should prompt for user input and return trimmed response', async () => {
      const mockReadline = {
        question: vi.fn(),
        close: vi.fn()
      };

      vi.mocked(readline.createInterface).mockReturnValue(mockReadline as any);

      // Mock the question callback to simulate user input
      mockReadline.question.mockImplementation((prompt, callback) => {
        callback('  user input with spaces  ');
      });

      const result = await CLIMessages.showPrompt();

      expect(readline.createInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stdout
      });

      expect(mockReadline.question).toHaveBeenCalledWith(
        expect.stringContaining('Gmail AI >'),
        expect.any(Function)
      );

      expect(mockReadline.close).toHaveBeenCalled();
      expect(result).toBe('user input with spaces');
    });

    it('should handle empty input gracefully', async () => {
      const mockReadline = {
        question: vi.fn(),
        close: vi.fn()
      };

      vi.mocked(readline.createInterface).mockReturnValue(mockReadline as any);

      mockReadline.question.mockImplementation((prompt, callback) => {
        callback('   ');
      });

      const result = await CLIMessages.showPrompt();

      expect(result).toBe('');
    });
  });

  describe('Confirmation Dialogs', () => {
    it('should show confirmation dialog and return user choice', async () => {
      const inquirer = await import('inquirer');
      vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: true });

      const action = 'Delete emails';
      const details = 'This will delete 5 emails';

      const result = await CLIMessages.confirmAction(action, details);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Confirmation Required')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining(`Action: ${action}`)
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining(`Details: ${details}`)
      );

      expect(inquirer.prompt).toHaveBeenCalledWith([{
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to proceed?',
        default: false
      }]);

      expect(result).toBe(true);
    });

    it('should handle user declining confirmation', async () => {
      const inquirer = await import('inquirer');
      vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: false });

      const result = await CLIMessages.confirmAction('Test Action', 'Test Details');

      expect(result).toBe(false);
    });

    it('should default to false for confirmation', async () => {
      const inquirer = await import('inquirer');
      // Ensure the mock returns the default value (confirm: false)
      vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: false });

      const result = await CLIMessages.confirmAction('Action', 'Details');

      const promptArgs = vi.mocked(inquirer.prompt).mock.calls[0][0] as any;
      expect(promptArgs[0].default).toBe(false);
    });
  });

  describe('Color and Formatting', () => {
    it('should use appropriate colors for different message types', () => {
      // Test error message uses red
      CLIMessages.showError('test error');
      expect(chalk.red).toHaveBeenCalled();

      // Test warning uses yellow
      CLIMessages.showWarning('test warning');
      expect(chalk.yellow).toHaveBeenCalled();

      // Test success uses green
      CLIMessages.showGmailConnected();
      expect(chalk.green).toHaveBeenCalled();

      // Test info uses cyan
      CLIMessages.showAssistantResponse('test response');
      expect(chalk.cyan).toHaveBeenCalled();

      // Note: showPrompt is async and uses readline, so we skip testing its chalk usage here
    });

    it('should use bold formatting for headers', () => {
      CLIMessages.showWelcome();
      expect(chalk.bold.green).toHaveBeenCalled();

      CLIMessages.showHelp();
      expect(chalk.yellow).toHaveBeenCalled(); // Section headers
    });

    it('should use gray for secondary information', () => {
      CLIMessages.showDebugInfo('tool', {});
      expect(chalk.gray).toHaveBeenCalled();

      CLIMessages.showHelp();
      expect(chalk.gray).toHaveBeenCalled(); // Example commands
    });
  });

  describe('Message Content Validation', () => {
    it('should include all required help sections', () => {
      CLIMessages.showHelp();

      const helpOutput = consoleSpy.log.mock.calls.flat().join('\n');

      // Required sections
      expect(helpOutput).toContain('Natural Language Examples');
      expect(helpOutput).toContain('Context-aware commands');
      expect(helpOutput).toContain('Commands:');

      // Essential examples that users need to know
      expect(helpOutput).toContain('Show my unread emails');
      expect(helpOutput).toContain('Read the most recent email');
      expect(helpOutput).toContain('Create a label');
      expect(helpOutput).toContain('Archive all promotional emails');

      // Context examples
      expect(helpOutput).toContain('After reading an email');
      expect(helpOutput).toContain('After searching');

      // Basic commands
      expect(helpOutput).toContain('clear');
      expect(helpOutput).toContain('help');
      expect(helpOutput).toContain('exit');
    });

    it('should provide clear API key setup instructions', () => {
      CLIMessages.showApiKeyError();

      const errorCalls = [
        ...consoleSpy.error.mock.calls.flat(),
        ...consoleSpy.log.mock.calls.flat()
      ].join('\n');

      expect(errorCalls).toContain('GROQ_API_KEY environment variable not set');
      expect(errorCalls).toContain('https://console.groq.com');
      expect(errorCalls).toContain('.env');
      expect(errorCalls).toContain('GROQ_API_KEY=');
    });

    it('should provide clear auth setup instructions', () => {
      CLIMessages.showGmailAuthNeeded();

      const output = consoleSpy.error.mock.calls.flat().join('\n');

      expect(output).toContain('Gmail auth needed');
      expect(output).toContain('npm run auth');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined or null messages gracefully', () => {
      expect(() => CLIMessages.showError('')).not.toThrow();
      expect(() => CLIMessages.showWarning('')).not.toThrow();
      expect(() => CLIMessages.showAssistantResponse('')).not.toThrow();
    });

    it('should handle complex debug objects', () => {
      const complexArgs = {
        nested: { deeply: { nested: { value: 'test' } } },
        array: [1, 2, { nested: true }],
        circular: null as any
      };
      complexArgs.circular = complexArgs;

      expect(() => CLIMessages.showDebugInfo('tool', complexArgs)).not.toThrow();
    });

    it('should handle readline interface creation failure', async () => {
      vi.mocked(readline.createInterface).mockImplementation(() => {
        throw new Error('Interface creation failed');
      });

      await expect(CLIMessages.showPrompt()).rejects.toThrow();
    });
  });
});