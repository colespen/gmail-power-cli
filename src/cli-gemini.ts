import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as readline from "readline";
import chalk from "chalk";
import ora from "ora";

interface ToolCall {
  name: string;
  arguments: any;
}

class GmailAICLI {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private rl: readline.Interface;
  private context: any[] = [];
  private gmailService: any = null;

  constructor() {
    // Check for API key
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.error(
        chalk.red("Error: GEMINI_API_KEY environment variable not set")
      );
      console.log(
        chalk.yellow(
          "Get your FREE API key from: https://aistudio.google.com/app/apikey"
        )
      );
      console.log(
        chalk.yellow('Then add to .env: GEMINI_API_KEY="your-key-here"')
      );
      process.exit(1);
    }

    this.genAI = new GoogleGenerativeAI(apiKey);

    // Use Gemini 1.5 Flash - it's fast and great for tool use
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.blue("\nGmail AI > "),
    });

    // Handle CTRL+C gracefully
    this.rl.on("SIGINT", () => {
      console.log(chalk.yellow("\n\nGoodbye! 👋"));
      process.exit(0);
    });
  }

  private async initializeGmailService() {
    if (!this.gmailService) {
      const { GmailService } = await import("./gmail-service.js");
      this.gmailService = new GmailService();
      await this.gmailService.initialize();
    }
    return this.gmailService;
  }

  private async callMCPTool(toolName: string, args: any): Promise<any> {
    const service = await this.initializeGmailService();

    try {
      switch (toolName) {
        case "search_emails":
          return await service.searchEmails(args.query, args.maxResults || 10);

        case "read_email":
          return await service.readEmail(args.messageId);

        case "send_email":
          return await service.sendEmail(args.to, args.subject, args.body, {
            cc: args.cc,
            threadId: args.threadId,
          });

        case "modify_labels":
          return await service.modifyLabels(
            args.messageIds,
            args.addLabels,
            args.removeLabels
          );

        case "batch_operation":
          return await service.batchOperation(args.query, args.operation);

        case "list_labels":
          return await service.listLabels();

        case "create_label":
          return await service.createLabel(args.name);

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error: any) {
      throw new Error(`Tool execution failed: ${error.message}`);
    }
  }

  private getTools() {
    return [
      {
        name: "search_emails",
        description: "Search for emails using Gmail query syntax",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                'Gmail search query (e.g., "is:unread", "from:user@example.com")',
            },
            maxResults: {
              type: "number",
              description: "Maximum number of results (default: 10)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "read_email",
        description: "Read the full content of an email",
        parameters: {
          type: "object",
          properties: {
            messageId: {
              type: "string",
              description: "The ID of the email message",
            },
          },
          required: ["messageId"],
        },
      },
      {
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
              description: "Email subject",
            },
            body: {
              type: "string",
              description: "Email body content",
            },
            cc: {
              type: "array",
              items: { type: "string" },
              description: "CC recipients",
            },
            threadId: {
              type: "string",
              description: "Thread ID for replies",
            },
          },
          required: ["to", "subject", "body"],
        },
      },
      {
        name: "modify_labels",
        description: "Add or remove labels from emails",
        parameters: {
          type: "object",
          properties: {
            messageIds: {
              type: "array",
              items: { type: "string" },
              description: "Email message IDs",
            },
            addLabels: {
              type: "array",
              items: { type: "string" },
              description: "Labels to add",
            },
            removeLabels: {
              type: "array",
              items: { type: "string" },
              description: "Labels to remove",
            },
          },
          required: ["messageIds"],
        },
      },
      {
        name: "batch_operation",
        description: "Perform batch operations on emails",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Gmail search query",
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
              description: "Operation to perform",
            },
          },
          required: ["query", "operation"],
        },
      },
      {
        name: "list_labels",
        description: "List all available Gmail labels",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "create_label",
        description: "Create a new Gmail label",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name for the new label",
            },
          },
          required: ["name"],
        },
      },
    ];
  }

  async processCommand(input: string): Promise<void> {
    const spinner = ora("Thinking...").start();

    try {
      // Build the prompt with tool descriptions and context
      const tools = this.getTools();
      const toolDescriptions = tools
        .map(
          (t) =>
            `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(
              t.parameters.properties,
              null,
              2
            )}`
        )
        .join("\n\n");

      // Include context about previous searches
      let contextInfo = "";
      if (this.context.length > 0) {
        contextInfo = "\nContext from previous commands in this session:\n";
        this.context.slice(-4).forEach((msg) => {
          if (msg.role === "user" && msg.parts[0].text.includes("Found")) {
            contextInfo += msg.parts[0].text + "\n";
          }
        });
      }

      const prompt = `You are a helpful Gmail assistant. You have access to these tools:

${toolDescriptions}

${contextInfo}

User request: "${input}"

Based on this request, determine which tool(s) to call and with what parameters.
If the user refers to "those emails" or "them" or similar, use the email IDs from the context above.

Respond with a JSON array of tool calls, followed by a natural language explanation.

Format your response EXACTLY like this:
TOOL_CALLS:
[{"name": "tool_name", "arguments": {...}}]
END_TOOL_CALLS

Then provide a friendly explanation of what you're doing.

Examples:
- For "show me unread emails", call: [{"name": "search_emails", "arguments": {"query": "is:unread", "maxResults": 10}}]
- For "archive old newsletters", call: [{"name": "batch_operation", "arguments": {"query": "from:newsletter older_than:30d", "operation": "archive"}}]
- For "read the first one", if you have email IDs in context, call: [{"name": "read_email", "arguments": {"messageId": "first_email_id_from_context"}}]`;

      const chat = this.model.startChat({
        history: this.context,
      });

      const result = await chat.sendMessage(prompt);
      const response = result.response.text();

      spinner.stop();

      // Extract tool calls
      const toolCallsMatch = response.match(
        /TOOL_CALLS:([\s\S]*?)END_TOOL_CALLS/
      );
      let toolCalls: ToolCall[] = [];

      if (toolCallsMatch) {
        try {
          toolCalls = JSON.parse(toolCallsMatch[1].trim());
        } catch (e) {
          console.error(chalk.red("Failed to parse tool calls"));
          return; // Return early but don't exit
        }
      }

      // Extract explanation
      const explanation = response
        .replace(/TOOL_CALLS:[\s\S]*?END_TOOL_CALLS/, "")
        .trim();
      if (explanation) {
        console.log(chalk.cyan("\n" + explanation));
      }

      // Store email IDs for context
      let foundEmailIds: string[] = [];

      // Execute tool calls
      for (const toolCall of toolCalls) {
        const toolSpinner = ora(`Executing ${toolCall.name}...`).start();
        try {
          const result = await this.callMCPTool(
            toolCall.name,
            toolCall.arguments
          );
          toolSpinner.succeed(`Completed ${toolCall.name}`);

          // Display results in a user-friendly way
          this.displayResult(toolCall.name, result);

          // Store email IDs for follow-up commands
          if (toolCall.name === "search_emails" && result.messages) {
            foundEmailIds = result.messages.map((m: any) => m.id);
          }
        } catch (error: any) {
          toolSpinner.fail(`Failed to execute ${toolCall.name}`);
          console.error(chalk.red(error.message));
        }
      }

      // Add to context for follow-up commands
      this.context.push(
        { role: "user", parts: [{ text: input }] },
        { role: "model", parts: [{ text: response }] }
      );

      // If we found emails, add their IDs to context
      if (foundEmailIds.length > 0) {
        this.context.push({
          role: "user",
          parts: [
            { text: `Found emails with IDs: ${foundEmailIds.join(", ")}` },
          ],
        });
      }

      // Keep context manageable (last 20 messages)
      if (this.context.length > 20) {
        this.context = this.context.slice(-20);
      }
    } catch (error: any) {
      spinner.fail("Failed to process command");
      console.error(chalk.red(error.message));
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
            console.log(chalk.gray(`   ID: ${msg.id}`));
            if (msg.snippet) {
              console.log(
                chalk.gray(`   Preview: ${msg.snippet.substring(0, 80)}...`)
              );
            }
            console.log();
          });
        } else {
          console.log(
            chalk.yellow("\n📭 No emails found matching your search.")
          );
        }
        break;

      case "read_email":
        console.log(chalk.bold(`\n📖 Email Content:\n`));
        console.log(chalk.white(`Subject: ${result.subject}`));
        console.log(chalk.white(`From: ${result.from}`));
        console.log(chalk.white(`Date: ${result.date}`));
        console.log(chalk.white(`\nBody:\n${result.body.substring(0, 1000)}`));
        if (result.body.length > 1000) {
          console.log(chalk.gray("\n... (truncated for display)"));
        }
        break;

      case "send_email":
        console.log(chalk.green(`\n✅ Email sent successfully!`));
        console.log(chalk.gray(`Message ID: ${result.id}`));
        break;

      case "batch_operation":
        console.log(
          chalk.green(`\n✅ Operation "${result.operation}" completed`)
        );
        console.log(chalk.gray(`Affected ${result.affected} emails`));
        break;

      case "list_labels":
        console.log(chalk.bold(`\n🏷️  Available Labels:\n`));
        result.forEach((label: any) => {
          if (label.type === "system") {
            console.log(chalk.blue(`• ${label.name}`));
          } else {
            console.log(chalk.white(`• ${label.name}`));
          }
        });
        break;

      case "create_label":
        console.log(
          chalk.green(`\n✅ Label "${result.name}" created successfully!`)
        );
        break;

      case "modify_labels":
        console.log(chalk.green(`\n✅ Labels updated successfully!`));
        console.log(chalk.gray(`Modified ${result.modified} emails`));
        break;

      default:
        console.log(chalk.gray(JSON.stringify(result, null, 2)));
    }
  }

  async start(): Promise<void> {
    console.clear();
    console.log(chalk.bold.green("╔════════════════════════════════════════╗"));
    console.log(chalk.bold.green("║     🚀 Gmail AI Assistant              ║"));
    console.log(chalk.bold.green("║     Powered by Google Gemini (FREE)    ║"));
    console.log(chalk.bold.green("╚════════════════════════════════════════╝"));
    console.log();
    console.log(chalk.yellow("📝 Example commands:"));
    console.log(chalk.gray('  • "Show me unread emails"'));
    console.log(
      chalk.gray('  • "Search for emails from John about the project"')
    );
    console.log(chalk.gray('  • "Read the first email" (after searching)'));
    console.log(chalk.gray('  • "Archive all promotional emails"'));
    console.log(chalk.gray('  • "Star important emails from my boss"'));
    console.log();
    console.log(chalk.cyan("💡 Tips:"));
    console.log(chalk.gray("  • Use natural language - I'll understand!"));
    console.log(
      chalk.gray(
        '  • Reference previous results with "those emails" or "the first one"'
      )
    );
    console.log(
      chalk.gray('  • Type "help" for more examples or "exit" to quit')
    );
    console.log(chalk.gray("  • Press Ctrl+C anytime to exit"));
    console.log();

    this.rl.prompt();

    this.rl.on("line", async (line) => {
      const input = line.trim();

      if (!input) {
        this.rl.prompt();
        return;
      }

      if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
        console.log(chalk.yellow("\nGoodbye! 👋\n"));
        process.exit(0);
      }

      if (input.toLowerCase() === "help") {
        this.showHelp();
        this.rl.prompt();
        return;
      }

      if (input.toLowerCase() === "clear") {
        console.clear();
        console.log(chalk.green("🚀 Gmail AI Assistant\n"));
        this.rl.prompt();
        return;
      }

      // Process the command and wait for it to complete
      await this.processCommand(input);

      // Always show the prompt again after processing
      this.rl.prompt();
    });

    this.rl.on("close", () => {
      console.log(chalk.yellow("\nGoodbye! 👋\n"));
      process.exit(0);
    });
  }

  private showHelp(): void {
    console.log(chalk.bold("\n📧 Gmail AI Assistant - Help\n"));

    console.log(chalk.underline("Search Examples:"));
    console.log(chalk.gray('  • "Find unread emails"'));
    console.log(chalk.gray('  • "Show emails from John"'));
    console.log(chalk.gray('  • "Search for emails with attachments"'));
    console.log(
      chalk.gray('  • "Find emails about project alpha from last week"')
    );

    console.log(chalk.underline("\nReading Emails:"));
    console.log(chalk.gray('  • "Read the first email" (after searching)'));
    console.log(chalk.gray('  • "Show me the content of the third one"'));

    console.log(chalk.underline("\nAction Examples:"));
    console.log(
      chalk.gray('  • "Archive all emails from newsletter@example.com"')
    );
    console.log(chalk.gray('  • "Mark all emails as read"'));
    console.log(chalk.gray('  • "Star those emails" (after searching)'));
    console.log(chalk.gray('  • "Delete old promotional emails"'));

    console.log(chalk.underline("\nLabel Examples:"));
    console.log(chalk.gray('  • "Create a label called Work"'));
    console.log(chalk.gray('  • "Show me all my labels"'));
    console.log(chalk.gray('  • "Add label Important to those emails"'));

    console.log(chalk.underline("\nSending Emails:"));
    console.log(
      chalk.gray(
        '  • "Send an email to alice@example.com saying I\'ll be late"'
      )
    );
    console.log(
      chalk.gray('  • "Compose an email to Bob about tomorrow\'s meeting"')
    );

    console.log(chalk.underline("\nCommands:"));
    console.log(chalk.gray('  • "clear" - Clear the screen'));
    console.log(chalk.gray('  • "help" - Show this help message'));
    console.log(chalk.gray('  • "exit" or "quit" - Exit the assistant'));
    console.log();
  }
}

// Initialize Gmail service on startup to catch auth errors early
async function main() {
  try {
    const cli = new GmailAICLI();
    await cli.start();
  } catch (error: any) {
    console.error(
      chalk.red("Failed to start Gmail AI Assistant:"),
      error.message
    );
    process.exit(1);
  }
}

main();
