import "dotenv/config";
import Groq from "groq-sdk";
import * as readline from "readline";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";

interface ToolCall {
  name: string;
  arguments: any;
}

interface EmailMessage {
  id: string;
  threadId?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  snippet?: string;
  labelIds?: string[];
}

interface Label {
  id: string;
  name: string;
  type?: string;
}

class GmailAICLI {
  private groq: Groq;
  private gmailService: any = null;
  private lastEmailIds: string[] = [];
  private lastSearchResults: EmailMessage[] = [];
  private lastReadEmailId: string | null = null;
  private conversationHistory: any[] = [];
  private labelsCache: Label[] = [];

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error(
        chalk.red("Error: GROQ_API_KEY environment variable not set")
      );
      console.log(
        chalk.yellow("Get your FREE API key from: https://console.groq.com")
      );
      console.log(
        chalk.yellow('Then add to .env: GROQ_API_KEY="your-key-here"')
      );
      process.exit(1);
    }

    this.groq = new Groq({ apiKey });
  }

  private async initializeGmailService() {
    if (!this.gmailService) {
      const { GmailService } = await import("./gmail-service.js");
      this.gmailService = new GmailService();
      await this.gmailService.initialize();
      // Cache labels on initialization
      await this.refreshLabelsCache();
    }
    return this.gmailService;
  }

  private async refreshLabelsCache() {
    try {
      this.labelsCache = await this.gmailService.listLabels();
    } catch (error) {
      console.error(chalk.yellow("Warning: Could not cache labels"));
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
                  'Gmail search query. Examples: "is:unread", "from:someone@example.com", "subject:meeting", "has:attachment", "newer_than:2d"',
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
          description: "Read the full content of a specific email by its ID",
          parameters: {
            type: "object",
            properties: {
              messageId: {
                type: "string",
                description: "The email message ID to read",
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
            "Add or remove labels from emails. Use label IDs or names.",
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
    // Stop the spinner if provided to allow proper prompt display
    if (spinner) {
      spinner.stop();
    }

    console.log(chalk.yellow(`\n⚠️  Confirmation Required:`));
    console.log(chalk.white(`Action: ${action}`));
    console.log(chalk.gray(`Details: ${details}`));

    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "Do you want to proceed?",
        default: false,
      },
    ]);

    // Restart the spinner if provided and confirmation is true
    if (spinner && confirm) {
      spinner.start();
    }

    return confirm;
  }

  private async callTool(toolName: string, args: any, spinner?: any): Promise<any> {
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

        // If it's a contextual reference
        if (messageId === "first" && this.lastEmailIds.length > 0) {
          messageId = this.lastEmailIds[0];
        } else if (messageId === "last" && this.lastEmailIds.length > 0) {
          messageId = this.lastEmailIds[this.lastEmailIds.length - 1];
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
              console.log(
                chalk.yellow(`Warning: Label "${label}" not found. Skipping.`)
              );
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
              console.log(
                chalk.yellow(`Warning: Label "${label}" not found. Skipping.`)
              );
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
        const confirmed = await this.confirmAction(args.action, args.details, spinner);
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
      }

      if (this.lastSearchResults.length > 0) {
        const lastEmail = this.lastSearchResults[0];
        contextInfo += `\nMost recent email from search: "${lastEmail.subject}" from ${lastEmail.from} (ID: ${lastEmail.id})`;
      }

      // builde messages with context
      const messages: any[] = [
        {
          role: "system",
          content: `You are a helpful Gmail assistant. You help users manage their emails efficiently and SAFELY.

                    CRITICAL SAFETY RULES:
                    1. NEVER archive emails (removeLabels: ["INBOX"]) unless explicitly asked
                    2. NEVER delete emails unless explicitly asked
                    3. When creating filters, only skip inbox if user says "skip inbox" or "archive"
                    4. Always use create_filter for filter requests, not batch_operation

                    UNDERSTANDING USER INTENT:
                    - "Create a filter" or "add a filter" → use create_filter tool
                    - "Apply to existing emails" → use batch_operation or modify_labels
                    - "Move emails to X" → add label X, do NOT remove from INBOX unless asked
                    - "Archive emails" → user explicitly wants to remove from INBOX

                    FILTER CREATION:
                    - For "emails from X go to Y label": create_filter with criteria.from and action.addLabelIds
                    - Only add removeLabelIds: ["INBOX"] if user says "skip inbox" or "archive automatically"
                    - Use wildcards for domains: "*@domain.com" matches all emails from that domain

                    ${contextInfo}

                    Remember: Be conservative with destructive actions. When in doubt, don't archive or delete.`,
        },
        ...this.conversationHistory,
        {
          role: "user",
          content: input,
        },
      ];

      // Use Llama 3.3 70B
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

      // Show assistant's response
      if (message.content) {
        console.log(chalk.cyan("\n" + message.content));
      }

      // Execute tool calls
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          const toolSpinner = ora(
            `Executing ${toolCall.function.name}...`
          ).start();

          try {
            const args = JSON.parse(toolCall.function.arguments);

            // Log for debugging
            console.log(
              chalk.gray(
                `Debug: ${toolCall.function.name} args:`,
                JSON.stringify(args, null, 2)
              )
            );

            const result = await this.callTool(toolCall.function.name, args, toolSpinner);
            toolSpinner.succeed(`Completed ${toolCall.function.name}`);

            // Display results
            this.displayResult(toolCall.function.name, result);
          } catch (error: any) {
            toolSpinner.fail(`Failed: ${error.message}`);
          }
        }
      }

      // Add to conversation history
      this.conversationHistory.push(
        { role: "user", content: input },
        { role: "assistant", content: message.content || "[Tool execution]" }
      );

      // Keep history manageable
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }
    } catch (error: any) {
      spinner.fail("Failed to process command");
      console.error(chalk.red("Error: " + error.message));

      if (error.message.includes("rate")) {
        console.log(
          chalk.yellow(
            "\n💡 Tip: Groq has a rate limit of 30 requests/minute. Wait a moment and try again."
          )
        );
      }
    }
  }

  private displayResult(toolName: string, result: any): void {
    switch (toolName) {
      case "search_emails":
        if (result.messages && result.messages.length > 0) {
          console.log(
            chalk.bold(`\n📧 Found ${result.messages.length} emails:\n`)
          );
          result.messages.forEach((msg: any, i: number) => {
            console.log(
              chalk.white(`${i + 1}. ${msg.subject || "(No subject)"}`)
            );
            console.log(chalk.gray(`   From: ${msg.from}`));
            console.log(chalk.gray(`   Date: ${msg.date}`));
            if (msg.labelIds?.includes("UNREAD")) {
              console.log(chalk.yellow(`   📌 Unread`));
            }
            if (msg.snippet) {
              console.log(
                chalk.gray(`   Preview: ${msg.snippet.substring(0, 80)}...`)
              );
            }
            console.log();
          });
        } else {
          console.log(chalk.yellow("\n📭 No emails found."));
        }
        break;

      case "read_email":
        console.log(chalk.bold(`\n📖 Email Content:\n`));
        console.log(
          chalk.white(`Subject: ${result.subject || "(No subject)"}`)
        );
        console.log(chalk.white(`From: ${result.from}`));
        console.log(chalk.white(`To: ${result.to}`));
        console.log(chalk.white(`Date: ${result.date}`));
        console.log(chalk.white(`\n--- Message ---\n`));
        const body = result.body || result.snippet || "";
        console.log(body.substring(0, 2000));
        if (body.length > 2000) {
          console.log(chalk.gray("\n... (truncated for display)"));
        }
        break;

      case "modify_labels":
        console.log(chalk.green(`\n✅ Labels updated successfully!`));
        const count = result.modified || result.results?.length || 1;
        console.log(
          chalk.gray(`Modified ${count} email${count > 1 ? "s" : ""}`)
        );
        break;

      case "create_label":
        console.log(chalk.green(`\n✅ Label created successfully!`));
        console.log(chalk.white(`Label name: ${result.name}`));
        break;

      case "create_filter":
        if (result.cancelled) {
          console.log(chalk.yellow("\n❌ Filter creation cancelled"));
        } else {
          console.log(chalk.green("\n✅ Filter created successfully!"));
          if (result.criteria) {
            console.log(chalk.white("Criteria:"));
            Object.entries(result.criteria).forEach(([key, value]) => {
              console.log(chalk.gray(`  ${key}: ${value}`));
            });
          }
          if (result.action) {
            console.log(chalk.white("Actions:"));
            if (result.action.addLabelIds) {
              console.log(
                chalk.gray(
                  `  Apply labels: ${result.action.addLabelIds.join(", ")}`
                )
              );
            }
            if (result.action.removeLabelIds) {
              console.log(
                chalk.gray(
                  `  Remove labels: ${result.action.removeLabelIds.join(", ")}`
                )
              );
            }
          }
        }
        break;

      case "list_filters":
        console.log(chalk.bold("\n📋 Gmail Filters:\n"));
        if (result.length === 0) {
          console.log(chalk.gray("No filters found"));
        } else {
          result.forEach((filter: any, i: number) => {
            console.log(chalk.white(`${i + 1}. Filter ID: ${filter.id}`));
            if (filter.criteria) {
              console.log(chalk.gray("   Criteria:"), filter.criteria);
            }
            if (filter.action) {
              console.log(chalk.gray("   Actions:"), filter.action);
            }
            console.log();
          });
        }
        break;

      case "batch_operation":
        if (result.cancelled) {
          console.log(chalk.yellow(`\n❌ Batch ${result.operation} cancelled`));
        } else {
          console.log(chalk.green(`\n✅ Batch operation completed!`));
          console.log(chalk.white(`Operation: ${result.operation}`));
          console.log(chalk.gray(`Affected ${result.affected} emails`));
        }
        break;

      default:
        // Keep other cases as they were
        break;
    }
  }

  private showHelp(): void {
    console.log(chalk.bold("\n📧 Gmail AI Assistant - Help\n"));

    console.log(chalk.yellow("Natural Language Examples:"));
    console.log(chalk.gray('  • "Show my unread emails"'));
    console.log(chalk.gray('  • "Read the most recent email from Shopify"'));
    console.log(chalk.gray('  • "Create a label called Work/Shopify"'));
    console.log(chalk.gray('  • "Move this email to the Shopify label"'));
    console.log(chalk.gray('  • "Mark it as read"'));
    console.log(chalk.gray('  • "Star those emails"'));
    console.log(chalk.gray('  • "Archive all promotional emails"'));

    console.log(chalk.yellow("\nContext-aware commands:"));
    console.log(chalk.gray('  • After reading an email: "move it to Work"'));
    console.log(chalk.gray('  • After searching: "mark them all as read"'));
    console.log(chalk.gray('  • "Reply to this email" (after reading)'));

    console.log(chalk.yellow("\nCommands:"));
    console.log(chalk.gray("  • clear - Clear the screen"));
    console.log(chalk.gray("  • help - Show this help message"));
    console.log(chalk.gray("  • exit - Quit the assistant\n"));
  }

  private async promptUser(): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(chalk.blue("\nGmail AI > "), (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  async start(): Promise<void> {
    console.clear();
    console.log(chalk.bold.green("╔════════════════════════════════════════╗"));
    console.log(chalk.bold.green("║     🚀 Gmail AI Assistant              ║"));
    console.log(chalk.bold.green("║     Powered by Groq (Llama 3.3)       ║"));
    console.log(chalk.bold.green("╚════════════════════════════════════════╝"));
    console.log();
    console.log(chalk.cyan("Natural language Gmail control - Fast & Free!"));
    console.log(
      chalk.gray('Try: "show my unread emails" or "help" for more\n')
    );

    // Initialize Gmail service
    try {
      await this.initializeGmailService();
      console.log(chalk.green("✓ Connected to Gmail\n"));
    } catch (error) {
      console.error(chalk.yellow("⚠️  Gmail auth needed. Run: npm run auth\n"));
    }

    // Main loop
    while (true) {
      const input = await this.promptUser();

      if (!input) continue;

      if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
        console.log(chalk.yellow("\nGoodbye! 👋\n"));
        process.exit(0);
      }

      if (input.toLowerCase() === "help") {
        this.showHelp();
        continue;
      }

      if (input.toLowerCase() === "clear") {
        console.clear();
        console.log(chalk.green("🚀 Gmail AI Assistant\n"));
        continue;
      }

      await this.processCommand(input);
    }
  }
}

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log(chalk.yellow("\n\nGoodbye! 👋"));
  process.exit(0);
});

// Main
async function main() {
  try {
    const cli = new GmailAICLI();
    await cli.start();
  } catch (error: any) {
    console.error(chalk.red("Failed to start:"), error.message);
    process.exit(1);
  }
}

main();
