import "dotenv/config";
import Groq from "groq-sdk";
import * as readline from "readline";
import chalk from "chalk";
import ora from "ora";

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
    ];
  }

  private async callTool(toolName: string, args: any): Promise<any> {
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

      case "batch_operation":
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
      // Build context information
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

      // Build the messages with context
      const messages: any[] = [
        {
          role: "system",
          content: `You are a helpful Gmail assistant. You help users manage their emails efficiently.

IMPORTANT CONTEXT RULES:
- When user says "it", "this email", "that email" - use the last read email ID or the first from recent search
- When user says "them", "those emails", "these" - use all IDs from the recent search
- When creating nested labels, use "/" (e.g., "Work/Shopify")
- When moving emails to labels, use the label name in addLabels
- Always be helpful and execute the most logical action based on context

${contextInfo}

LABEL OPERATIONS:
- To apply a label: use modify_labels with addLabels: ["label_name"]
- To move to a label: use modify_labels with addLabels: ["label_name"] and removeLabels: ["INBOX"] if archiving
- To mark as read: removeLabels: ["UNREAD"]
- To star: addLabels: ["STARRED"]
- To archive: removeLabels: ["INBOX"]

When user says "move this email to X label", use the last read email ID or most recent search result.`,
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

            const result = await this.callTool(toolCall.function.name, args);
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
