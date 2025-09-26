import "dotenv/config";
import Groq from "groq-sdk";
import ora from "ora";
import { CLIMessages } from "./cli-messages.js";
import { CLIDisplay } from "./cli-display.js";
import { createSystemPrompt } from "./system-prompts.js";
import {
  ChatMessage,
  // ToolCall,
  // ChatResponse,
  EmailMessage,
  Label,
  // SearchResult
} from "./types.js";

class GmailAICLI {
  private groq: Groq;
  private gmailService: any = null; // TODO: Type this properly when gmail-service is typed
  private lastEmailIds: string[] = [];
  private lastSearchResults: EmailMessage[] = [];
  private lastReadEmailId: string | null = null;
  private conversationHistory: ChatMessage[] = [];
  private labelsCache: Label[] = [];

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      CLIMessages.showApiKeyError();
      process.exit(1);
    }

    this.groq = new Groq({ apiKey });
  }

  private async initializeGmailService() {
    if (!this.gmailService) {
      const { GmailService } = await import("./gmail-service.js");
      this.gmailService = new GmailService();
      await this.gmailService.initialize();
      // cache labels on initialization
      await this.refreshLabelsCache();
    }
    return this.gmailService;
  }

  private async refreshLabelsCache() {
    try {
      this.labelsCache = await this.gmailService.listLabels();
    } catch (error) {
      CLIMessages.showWarning("Could not cache labels");
    }
  }

  private getLabelIdByName(labelName: string): string | null {
    const label = this.labelsCache.find(
      (l) => l.name.toLowerCase() === labelName.toLowerCase()
    );
    return label ? label.id : null;
  }

  private getTools() {
    return [
      {
        type: "function" as const,
        function: {
          name: "search_emails",
          description:
            "Search for emails using Gmail query syntax. Use this to find emails.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  'Gmail search query. Examples: "is:unread", "from:someone@example.com", "subject:meeting", "has:attachment", "newer_than:1h", "newer_than:2d", "older_than:1m", "after:2024/01/01", "before:2024/12/31". Time units: h=hours, d=days, m=months, y=years (integers only).',
              },
              maxResults: {
                type: "number",
                description: "Max number of results to return",
                default: 10,
              },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "read_email",
          description:
            "Read the full content of a specific email by its ID. Use actual message IDs from search results, or contextual references like 'first', 'last', '1', '2', etc.",
          parameters: {
            type: "object",
            properties: {
              messageId: {
                type: "string",
                description:
                  "The email message ID to read. Use: actual Gmail message ID from search results, OR contextual reference like 'first' (first email from last search), 'last'/'latest' (most recent email), '1' (first email), '2' (second email), etc. System will auto-search if no context exists.",
              },
            },
            required: ["messageId"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "modify_labels",
          description:
            "Add or remove labels from existing emails. Use this to apply labels to emails from search results or specific email IDs. Use label names or IDs.",
          parameters: {
            type: "object",
            properties: {
              messageIds: {
                type: "array",
                items: { type: "string" },
                description: "Array of email message IDs to modify",
              },
              addLabels: {
                type: "array",
                items: { type: "string" },
                description:
                  'Labels to add (names or IDs). Common: "STARRED", "IMPORTANT", "UNREAD", or custom label names',
              },
              removeLabels: {
                type: "array",
                items: { type: "string" },
                description:
                  'Labels to remove (names or IDs). Common: "UNREAD" (mark as read), "INBOX" (archive), "STARRED" (unstar)',
              },
            },
            required: ["messageIds"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "batch_operation",
          description:
            "Perform batch operations on emails matching a search query",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Gmail search query to find emails",
              },
              operation: {
                type: "string",
                enum: [
                  "archive",
                  "delete",
                  "markRead",
                  "markUnread",
                  "star",
                  "unstar",
                ],
                description: "Operation to perform on matching emails",
              },
            },
            required: ["query", "operation"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "send_email",
          description: "Send a new email",
          parameters: {
            type: "object",
            properties: {
              to: {
                type: "array",
                items: { type: "string" },
                description: "Recipient email addresses",
              },
              subject: {
                type: "string",
                description: "Email subject line",
              },
              body: {
                type: "string",
                description: "Email body content",
              },
              cc: {
                type: "array",
                items: { type: "string" },
                description: "CC recipients (optional)",
              },
            },
            required: ["to", "subject", "body"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "list_labels",
          description: "List all available Gmail labels in the account",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "create_label",
          description: "Create a new Gmail label",
          parameters: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description:
                  'Name for the new label. Use "/" for nested labels (e.g., "Work/Shopify")',
              },
            },
            required: ["name"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "create_filter",
          description:
            "Create a Gmail filter to automatically process incoming emails",
          parameters: {
            type: "object",
            properties: {
              criteria: {
                type: "object",
                properties: {
                  from: {
                    type: "string",
                    description:
                      'Filter emails from this address/domain (e.g., "*@email.shopify.com")',
                  },
                  to: {
                    type: "string",
                    description: "Filter emails to this address",
                  },
                  subject: {
                    type: "string",
                    description: "Filter emails with this in subject",
                  },
                  query: {
                    type: "string",
                    description: "Gmail search query for complex filters",
                  },
                  hasAttachment: {
                    type: "boolean",
                    description: "Filter emails with attachments",
                  },
                },
                description: "Criteria for the filter",
              },
              action: {
                type: "object",
                properties: {
                  addLabelIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Label IDs to apply to matching emails",
                  },
                  removeLabelIds: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "Label IDs to remove (use carefully - INBOX means skip inbox/archive)",
                  },
                  forward: {
                    type: "string",
                    description: "Forward to this email address",
                  },
                },
                description: "Actions to perform on matching emails",
              },
            },
            required: ["criteria", "action"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "list_filters",
          description: "List all existing Gmail filters",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "confirm_dangerous_action",
          description: "Ask user to confirm potentially dangerous actions",
          parameters: {
            type: "object",
            properties: {
              action: {
                type: "string",
                description: "Description of the action to confirm",
              },
              details: {
                type: "string",
                description: "Details about what will happen",
              },
            },
            required: ["action", "details"],
          },
        },
      },
    ];
  }

  private async confirmAction(
    action: string,
    details: string,
    spinner?: any
  ): Promise<boolean> {
    if (spinner) {
      spinner.stop();
    }

    const confirmed = await CLIMessages.confirmAction(action, details);

    if (spinner && confirmed) {
      spinner.start();
    }

    return confirmed;
  }

  private async callTool(
    toolName: string,
    args: any,
    spinner?: any
  ): Promise<any> {
    const service = await this.initializeGmailService();

    switch (toolName) {
      case "search_emails":
        const searchResult = await service.searchEmails(
          args.query,
          args.maxResults || 10
        );
        // Store results for context
        if (searchResult.messages) {
          this.lastSearchResults = searchResult.messages;
          this.lastEmailIds = searchResult.messages.map((m: any) => m.id);
        }
        return searchResult;

      case "read_email":
        // Handle context-aware message IDs
        let messageId = args.messageId;

        // If it's a contextual reference but we have no search context, search first
        if (
          (messageId === "first" ||
            messageId === "last" ||
            messageId === "latest") &&
          this.lastEmailIds.length === 0
        ) {
          // Auto-search for recent emails to establish context
          const searchResult = await service.searchEmails("", 10);
          if (searchResult.messages) {
            this.lastSearchResults = searchResult.messages;
            this.lastEmailIds = searchResult.messages.map((m: any) => m.id);
          }
        }

        // If it's a contextual reference
        if (messageId === "first" && this.lastEmailIds.length > 0) {
          messageId = this.lastEmailIds[0];
        } else if (
          (messageId === "last" || messageId === "latest") &&
          this.lastEmailIds.length > 0
        ) {
          messageId = this.lastEmailIds[0]; // Most recent email is first in Gmail API results
        } else if (messageId === "last_read" && this.lastReadEmailId) {
          messageId = this.lastReadEmailId;
        } else if (
          !isNaN(parseInt(messageId)) &&
          this.lastEmailIds.length > 0
        ) {
          const index = parseInt(messageId) - 1;
          if (index >= 0 && index < this.lastEmailIds.length) {
            messageId = this.lastEmailIds[index];
          }
        }

        const emailContent = await service.readEmail(messageId);
        // Store this as the last read email
        this.lastReadEmailId = messageId;
        return emailContent;

      case "modify_labels":
        // Handle context-aware message IDs
        let messageIds = args.messageIds;

        // If referring to context
        if (messageIds && messageIds.length === 1) {
          if (
            messageIds[0] === "all_from_search" ||
            messageIds[0] === "those"
          ) {
            messageIds = this.lastEmailIds;
          } else if (messageIds[0] === "last_read" && this.lastReadEmailId) {
            messageIds = [this.lastReadEmailId];
          } else if (messageIds[0] === "it" || messageIds[0] === "this") {
            // Use last read email if available, otherwise use first from search
            if (this.lastReadEmailId) {
              messageIds = [this.lastReadEmailId];
            } else if (this.lastEmailIds.length > 0) {
              messageIds = [this.lastEmailIds[0]];
            }
          }
        }

        // Convert label names to IDs
        let addLabelIds = args.addLabels || [];
        let removeLabelIds = args.removeLabels || [];

        // Process addLabels - convert names to IDs
        if (addLabelIds.length > 0) {
          addLabelIds = await Promise.all(
            addLabelIds.map(async (label: string) => {
              // System labels are already IDs
              if (label.toUpperCase() === label || label.startsWith("Label_")) {
                return label;
              }
              // Look up custom label ID by name
              const labelId = this.getLabelIdByName(label);
              if (labelId) {
                return labelId;
              }
              // If not found, refresh cache and try again
              await this.refreshLabelsCache();
              const refreshedId = this.getLabelIdByName(label);
              if (refreshedId) {
                return refreshedId;
              }
              CLIMessages.showWarning(`Label "${label}" not found. Skipping.`);
              return null;
            })
          );
          addLabelIds = addLabelIds.filter((id: any) => id !== null);
        }

        // Process removeLabels - convert names to IDs
        if (removeLabelIds.length > 0) {
          removeLabelIds = await Promise.all(
            removeLabelIds.map(async (label: string) => {
              // System labels
              if (label.toUpperCase() === label || label.startsWith("Label_")) {
                return label;
              }
              // Look up custom label ID
              const labelId = this.getLabelIdByName(label);
              if (labelId) {
                return labelId;
              }
              await this.refreshLabelsCache();
              const refreshedId = this.getLabelIdByName(label);
              if (refreshedId) {
                return refreshedId;
              }
              CLIMessages.showWarning(`Label "${label}" not found. Skipping.`);
              return null;
            })
          );
          removeLabelIds = removeLabelIds.filter((id: any) => id !== null);
        }

        return await service.modifyLabels(
          messageIds,
          addLabelIds,
          removeLabelIds
        );

      case "create_filter":
        // Convert label names to IDs in the action
        if (args.action.addLabelIds) {
          const labelIds = await Promise.all(
            args.action.addLabelIds.map(async (label: string) => {
              if (label.toUpperCase() === label) return label; // System label
              const labelId = this.getLabelIdByName(label);
              if (!labelId) {
                await this.refreshLabelsCache();
                const refreshedId = this.getLabelIdByName(label);
                if (!refreshedId) {
                  throw new Error(`Label not found: ${label}`);
                }
                return refreshedId;
              }
              return labelId;
            })
          );
          args.action.addLabelIds = labelIds;
        }

        // Warn if archiving (removing from INBOX)
        if (args.action.removeLabelIds?.includes("INBOX")) {
          const confirmed = await this.confirmAction(
            "Create filter that archives emails",
            `Emails matching this filter will skip the inbox (be archived automatically)`,
            spinner
          );
          if (!confirmed) {
            return { cancelled: true };
          }
        }

        return await service.createFilter(args.criteria, args.action);

      case "list_filters":
        return await service.listFilters();

      case "confirm_dangerous_action":
        const confirmed = await this.confirmAction(
          args.action,
          args.details,
          spinner
        );
        return { confirmed };

      case "batch_operation":
        // Add safety check for batch operations
        if (args.operation === "delete") {
          const confirmed = await this.confirmAction(
            "Batch delete emails",
            `This will move emails matching "${args.query}" to trash`
          );
          if (!confirmed) {
            return { cancelled: true, operation: args.operation };
          }
        }
        if (args.operation === "archive") {
          const confirmed = await this.confirmAction(
            "Batch archive emails",
            `This will remove emails matching "${args.query}" from inbox`
          );
          if (!confirmed) {
            return { cancelled: true, operation: args.operation };
          }
        }
        return await service.batchOperation(args.query, args.operation);

      case "send_email":
        return await service.sendEmail(args.to, args.subject, args.body, {
          cc: args.cc,
        });

      case "list_labels":
        const labels = await service.listLabels();
        this.labelsCache = labels; // Update cache
        return labels;

      case "create_label":
        const newLabel = await service.createLabel(args.name);
        await this.refreshLabelsCache(); // Refresh cache after creating
        return newLabel;

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async processCommand(input: string): Promise<void> {
    const spinner = ora("Thinking...").start();

    try {
      // build context information
      let contextInfo = "";

      if (this.lastReadEmailId) {
        contextInfo += `\nLast read email ID: ${this.lastReadEmailId}`;
      }

      if (this.lastEmailIds.length > 0) {
        contextInfo += `\nRecent search returned ${
          this.lastEmailIds.length
        } emails with IDs: ${this.lastEmailIds.slice(0, 5).join(", ")}`;
        if (this.lastEmailIds.length > 5) {
          contextInfo += "...";
        }
        contextInfo += `\nFor "add these to [label]" or "label these", use modify_labels with these email IDs.`;
      }

      if (this.lastSearchResults.length > 0) {
        const lastEmail = this.lastSearchResults[0];
        contextInfo += `\nMost recent email from search: "${lastEmail.subject}" from ${lastEmail.from} (ID: ${lastEmail.id})`;
      }

      // Add available labels for proper search syntax
      if (this.labelsCache.length > 0) {
        const userLabels = this.labelsCache
          .filter(label => label.type === 'user')
          .map(label => label.name)
          .slice(0, 10); // Show first 10 user labels
        if (userLabels.length > 0) {
          contextInfo += `\nAvailable labels for searches: ${userLabels.join(', ')}`;
          contextInfo += `\nUse exact label names in quotes: label:"${userLabels[0]}"`;
        }
      }

      // build messages with context
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: createSystemPrompt(contextInfo),
        },
        ...this.conversationHistory,
        {
          role: "user",
          content: input,
        },
      ];

      // use Llama 3.3 70B
      const response = await this.groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        tools: this.getTools(),
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 1024,
      });

      spinner.stop();

      const message = response.choices[0].message;

      if (message.content) {
        CLIMessages.showAssistantResponse(message.content);
      }

      // execute tool calls
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          const toolSpinner = ora(
            `Executing ${toolCall.function.name}...`
          ).start();

          try {
            const args = JSON.parse(toolCall.function.arguments);

            CLIMessages.showDebugInfo(toolCall.function.name, args);

            const result = await this.callTool(
              toolCall.function.name,
              args,
              toolSpinner
            );
            toolSpinner.succeed(`Completed ${toolCall.function.name}`);

            this.displayResult(toolCall.function.name, result);
          } catch (error: any) {
            toolSpinner.fail(`Failed: ${error.message}`);
          }
        }
      }

      // add to conversation history
      this.conversationHistory.push(
        { role: "user", content: input },
        { role: "assistant", content: message.content || "[Tool execution]" }
      );

      // keep history manageable
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }
    } catch (error: any) {
      spinner.fail("Failed to process command");
      CLIMessages.showError(error.message);

      if (error.message.includes("rate")) {
        CLIMessages.showRateLimit();
      }
    }
  }

  private displayResult(toolName: string, result: any): void {
    switch (toolName) {
      case "search_emails":
        CLIDisplay.showSearchResults(result);
        break;

      case "read_email":
        CLIDisplay.showEmailContent(result);
        break;

      case "modify_labels":
        CLIDisplay.showLabelsModified(result);
        break;

      case "create_label":
        CLIDisplay.showLabelCreated(result);
        break;

      case "create_filter":
        CLIDisplay.showFilterResult(result);
        break;

      case "list_filters":
        CLIDisplay.showFiltersList(result);
        break;

      case "batch_operation":
        CLIDisplay.showBatchOperationResult(result);
        break;

      case "send_email":
        CLIDisplay.showSendEmailResult(result);
        break;

      case "list_labels":
        CLIDisplay.showLabelsList(result);
        break;

      default:
        break;
    }
  }

  private showHelp(): void {
    CLIMessages.showHelp();
  }

  private async promptUser(): Promise<string> {
    return CLIMessages.showPrompt();
  }

  async start(): Promise<void> {
    CLIMessages.showWelcome();

    try {
      await this.initializeGmailService();
      CLIMessages.showGmailConnected();
    } catch (error) {
      CLIMessages.showGmailAuthNeeded();
    }

    // main loop
    while (true) {
      const input = await this.promptUser();

      if (!input) continue;

      if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
        CLIMessages.showGoodbye();
        process.exit(0);
      }

      if (input.toLowerCase() === "help") {
        this.showHelp();
        continue;
      }

      if (input.toLowerCase() === "clear") {
        CLIMessages.showClearScreen();
        continue;
      }

      await this.processCommand(input);
    }
  }
}

process.on("SIGINT", () => {
  CLIMessages.showGoodbye();
  process.exit(0);
});

async function main() {
  try {
    const cli = new GmailAICLI();
    await cli.start();
  } catch (error: any) {
    CLIMessages.showError(`Failed to start: ${error.message}`);
    process.exit(1);
  }
}

main();
