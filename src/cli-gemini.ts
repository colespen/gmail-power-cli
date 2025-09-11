import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as readline from "readline";
import chalk from "chalk";
import ora from "ora";

// Keep the process alive
process.stdin.resume();

class GmailAICLI {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private context: any[] = [];
  private gmailService: any = null;
  private isProcessing: boolean = false;
  private lastEmailIds: string[] = [];

  constructor() {
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
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
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

  private async promptUser(): Promise<string> {
    return new Promise((resolve) => {
      process.stdout.write(chalk.blue("\nGmail AI > "));

      // Create a fresh readline interface for each prompt
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false, // Disable built-in terminal handling
      });

      const handleLine = (line: string) => {
        console.log(chalk.gray(`[DEBUG] Line event received: "${line}"`));
        rl.close();
        resolve(line.trim());
      };

      rl.once("line", handleLine);
    });
  }

  private async runInteractiveLoop(): Promise<void> {
    while (true) {
      try {
        const input = await this.promptUser();
        console.log(chalk.gray(`[DEBUG] Got input: "${input}"`));

        if (!input) {
          continue;
        }

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

        // Process the command
        this.isProcessing = true;
        try {
          await this.processCommand(input);
          console.log(chalk.gray("[DEBUG] processCommand completed"));
        } catch (error: any) {
          console.error(chalk.red("Error in processCommand:"), error);
        } finally {
          this.isProcessing = false;
        }
      } catch (error: any) {
        console.error(chalk.red("Error in interactive loop:"), error);
      }
    }
  }

  private async callMCPTool(toolName: string, args: any): Promise<any> {
    const service = await this.initializeGmailService();

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
  }

  async processCommand(input: string): Promise<void> {
    const spinner = ora("Thinking...").start();

    try {
      // Build context-aware prompt
      let contextInfo = "";
      if (this.lastEmailIds.length > 0) {
        contextInfo = `\nContext: The user recently searched and found emails with IDs: ${this.lastEmailIds.join(
          ", "
        )}`;
        contextInfo +=
          '\nIf the user refers to "it", "that email", "those emails", use these IDs.';
      }

      const prompt = `You are a helpful Gmail assistant. 

User request: "${input}"
${contextInfo}

Available tools:
- search_emails(query, maxResults) - Use Gmail search syntax
- read_email(messageId) - Read a specific email
- send_email(to[], subject, body) - Send an email
- modify_labels(messageIds[], addLabels[], removeLabels[]) - Modify labels
  * To mark as read: removeLabels: ["UNREAD"]
  * To mark as unread: addLabels: ["UNREAD"]
  * To star: addLabels: ["STARRED"]
  * To archive: removeLabels: ["INBOX"]
- batch_operation(query, operation) - Operations: archive, delete, markRead, markUnread, star, unstar
- list_labels() - List all labels
- create_label(name) - Create new label

Respond with:
TOOL_CALLS:
[{"name": "tool_name", "arguments": {...}}]
END_TOOL_CALLS

Then provide a friendly explanation.

Examples:
- "mark it as read" with context -> [{"name": "modify_labels", "arguments": {"messageIds": ["id_from_context"], "removeLabels": ["UNREAD"]}}]
- "show unread emails" -> [{"name": "search_emails", "arguments": {"query": "is:unread", "maxResults": 10}}]`;

      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      spinner.stop();

      // Extract tool calls
      const toolCallsMatch = response.match(
        /TOOL_CALLS:([\s\S]*?)END_TOOL_CALLS/
      );
      let toolCalls = [];

      if (toolCallsMatch) {
        try {
          toolCalls = JSON.parse(toolCallsMatch[1].trim());
        } catch (e) {
          console.error(chalk.red("Failed to parse tool calls"));
          return;
        }
      }

      // Extract and show explanation
      const explanation = response
        .replace(/TOOL_CALLS:[\s\S]*?END_TOOL_CALLS/, "")
        .trim();
      if (explanation) {
        console.log(chalk.cyan("\n" + explanation));
      }

      // Execute tool calls
      for (const toolCall of toolCalls) {
        const toolSpinner = ora(`Executing ${toolCall.name}...`).start();
        try {
          const result = await this.callMCPTool(
            toolCall.name,
            toolCall.arguments
          );
          toolSpinner.succeed(`Completed ${toolCall.name}`);

          // Display results
          this.displayResult(toolCall.name, result);

          // Update context for follow-up commands
          if (toolCall.name === "search_emails" && result.messages) {
            this.lastEmailIds = result.messages.map((m: any) => m.id);
          }
        } catch (error: any) {
          toolSpinner.fail(`Failed: ${error.message}`);
        }
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
          console.log(chalk.yellow("\n📭 No emails found."));
        }
        break;

      case "read_email":
        console.log(chalk.bold(`\n📖 Email Content:\n`));
        console.log(chalk.white(`Subject: ${result.subject}`));
        console.log(chalk.white(`From: ${result.from}`));
        console.log(chalk.white(`Date: ${result.date}`));
        console.log(
          chalk.white(
            `\nBody:\n${result.body?.substring(0, 1000) || result.snippet}`
          )
        );
        if (result.body?.length > 1000) {
          console.log(chalk.gray("\n... (truncated)"));
        }
        break;

      case "send_email":
        console.log(chalk.green(`\n✅ Email sent successfully!`));
        console.log(chalk.gray(`Message ID: ${result.id}`));
        break;

      case "modify_labels":
        console.log(chalk.green(`\n✅ Labels updated successfully!`));
        console.log(
          chalk.gray(
            `Modified ${
              result.modified || result.results?.length || 1
            } email(s)`
          )
        );
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
            console.log(chalk.blue(`• ${label.name} (${label.id})`));
          } else {
            console.log(chalk.white(`• ${label.name}`));
          }
        });
        break;

      case "create_label":
        console.log(chalk.green(`\n✅ Label "${result.name}" created!`));
        break;

      default:
        console.log(
          chalk.gray(JSON.stringify(result, null, 2).substring(0, 500))
        );
    }
    console.log(); // Extra line for readability
  }

  private showHelp(): void {
    console.log(chalk.bold("\n📧 Gmail AI Assistant - Help\n"));

    console.log(chalk.underline("Search:"));
    console.log(chalk.gray('  • "Show my unread emails"'));
    console.log(chalk.gray('  • "Find emails from John"'));
    console.log(chalk.gray('  • "Search emails with attachments"'));

    console.log(chalk.underline("\nActions:"));
    console.log(chalk.gray('  • "Mark it as read" (after searching)'));
    console.log(chalk.gray('  • "Star those emails"'));
    console.log(chalk.gray('  • "Archive all promotional emails"'));

    console.log(chalk.underline("\nLabels:"));
    console.log(chalk.gray('  • "Show my labels"'));
    console.log(chalk.gray('  • "Create a label called Work"'));

    console.log(chalk.underline("\nCommands:"));
    console.log(chalk.gray("  • clear - Clear screen"));
    console.log(chalk.gray("  • help - Show this help"));
    console.log(chalk.gray("  • exit - Quit\n"));
  }

  async start(): Promise<void> {
    console.clear();
    console.log(chalk.bold.green("╔════════════════════════════════════════╗"));
    console.log(chalk.bold.green("║     🚀 Gmail AI Assistant              ║"));
    console.log(chalk.bold.green("║     Powered by Google Gemini (FREE)    ║"));
    console.log(chalk.bold.green("╚════════════════════════════════════════╝"));
    console.log();
    console.log(chalk.cyan('Try: "show my recent emails" or "help" for more'));

    // Initialize Gmail service early
    try {
      await this.initializeGmailService();
    } catch (error) {
      console.error(chalk.yellow("⚠️  Gmail auth needed. Run: npm run auth\n"));
    }

    // Start the interactive loop
    await this.runInteractiveLoop();
  }
}

// Error boundary for the entire app
process.on("uncaughtException", (error) => {
  console.error(chalk.red("Uncaught exception:"), error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    chalk.red("Unhandled rejection at:"),
    promise,
    "reason:",
    reason
  );
});

// Main
async function main() {
  try {
    const cli = new GmailAICLI();
    await cli.start();
  } catch (error: any) {
    console.error(chalk.red("Main error:"), error);
    // Keep trying
    setTimeout(main, 1000);
  }
}

main();
