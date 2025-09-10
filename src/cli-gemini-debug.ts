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
  private rl: readline.Interface | null = null;
  private context: any[] = [];
  private gmailService: any = null;
  private isProcessing: boolean = false;

  constructor() {
    console.log(chalk.gray("[DEBUG] Initializing GmailAICLI..."));

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

    console.log(chalk.gray("[DEBUG] API key found, initializing Gemini..."));

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    console.log(chalk.gray("[DEBUG] Gemini initialized"));
  }

  private async initializeGmailService() {
    console.log(chalk.gray("[DEBUG] Initializing Gmail service..."));
    if (!this.gmailService) {
      try {
        const { GmailService } = await import("./gmail-service.js");
        this.gmailService = new GmailService();
        await this.gmailService.initialize();
        console.log(
          chalk.gray("[DEBUG] Gmail service initialized successfully")
        );
      } catch (error: any) {
        console.error(
          chalk.red("[DEBUG] Failed to initialize Gmail service:"),
          error.message
        );
        throw error;
      }
    }
    return this.gmailService;
  }

  private setupReadline() {
    console.log(chalk.gray("[DEBUG] Setting up readline interface..."));

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.blue("\nGmail AI > "),
      terminal: true,
    });

    // Prevent readline from closing on errors
    this.rl.on("error", (err) => {
      console.error(chalk.red("[DEBUG] Readline error:"), err);
    });

    // Handle SIGINT (Ctrl+C)
    this.rl.on("SIGINT", () => {
      if (this.isProcessing) {
        console.log(chalk.yellow("\n[Cancelling current operation...]"));
        this.isProcessing = false;
        this.rl?.prompt();
      } else {
        console.log(chalk.yellow("\n\nGoodbye! 👋"));
        process.exit(0);
      }
    });

    // Setup line handler
    this.rl.on("line", async (line) => {
      console.log(chalk.gray(`[DEBUG] Received input: "${line}"`));

      const input = line.trim();

      if (!input) {
        this.rl?.prompt();
        return;
      }

      if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
        console.log(chalk.yellow("\nGoodbye! 👋\n"));
        this.rl?.close();
        process.exit(0);
      }

      if (input.toLowerCase() === "help") {
        this.showHelp();
        this.rl?.prompt();
        return;
      }

      if (input.toLowerCase() === "clear") {
        console.clear();
        console.log(chalk.green("🚀 Gmail AI Assistant\n"));
        this.rl?.prompt();
        return;
      }

      // Mark as processing
      this.isProcessing = true;

      try {
        console.log(chalk.gray("[DEBUG] Processing command..."));
        await this.processCommand(input);
        console.log(chalk.gray("[DEBUG] Command processing complete"));
      } catch (error: any) {
        console.error(chalk.red("[DEBUG] Error in processCommand:"), error);
      } finally {
        this.isProcessing = false;
        // CRITICAL: Always prompt again
        if (this.rl && !this.rl.closed) {
          this.rl.prompt();
        } else {
          console.log(chalk.red("[DEBUG] Readline was closed unexpectedly!"));
        }
      }
    });

    this.rl.on("close", () => {
      console.log(chalk.gray("[DEBUG] Readline close event triggered"));
      if (!this.isProcessing) {
        console.log(chalk.yellow("\nGoodbye! 👋\n"));
        process.exit(0);
      }
    });

    console.log(chalk.gray("[DEBUG] Readline setup complete"));
  }

  private async callMCPTool(toolName: string, args: any): Promise<any> {
    console.log(chalk.gray(`[DEBUG] Calling tool: ${toolName}`));

    try {
      const service = await this.initializeGmailService();

      let result;
      switch (toolName) {
        case "search_emails":
          result = await service.searchEmails(
            args.query,
            args.maxResults || 10
          );
          break;
        case "read_email":
          result = await service.readEmail(args.messageId);
          break;
        case "send_email":
          result = await service.sendEmail(args.to, args.subject, args.body, {
            cc: args.cc,
            threadId: args.threadId,
          });
          break;
        case "modify_labels":
          result = await service.modifyLabels(
            args.messageIds,
            args.addLabels,
            args.removeLabels
          );
          break;
        case "batch_operation":
          result = await service.batchOperation(args.query, args.operation);
          break;
        case "list_labels":
          result = await service.listLabels();
          break;
        case "create_label":
          result = await service.createLabel(args.name);
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      console.log(
        chalk.gray(`[DEBUG] Tool ${toolName} completed successfully`)
      );
      return result;
    } catch (error: any) {
      console.error(
        chalk.red(`[DEBUG] Tool ${toolName} failed:`),
        error.message
      );
      throw error;
    }
  }

  async processCommand(input: string): Promise<void> {
    const spinner = ora("Thinking...").start();

    try {
      // Build the prompt
      const prompt = `You are a helpful Gmail assistant. 

User request: "${input}"

Determine which Gmail tool(s) to call. Available tools:
- search_emails(query, maxResults)
- read_email(messageId)
- send_email(to[], subject, body)
- modify_labels(messageIds[], addLabels[], removeLabels[])
- batch_operation(query, operation: archive|delete|markRead|markUnread|star|unstar)
- list_labels()
- create_label(name)

Respond with:
TOOL_CALLS:
[{"name": "tool_name", "arguments": {...}}]
END_TOOL_CALLS

Then a friendly explanation.`;

      console.log(chalk.gray("[DEBUG] Sending to Gemini..."));

      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      console.log(chalk.gray("[DEBUG] Received Gemini response"));
      spinner.stop();

      // Extract tool calls
      const toolCallsMatch = response.match(
        /TOOL_CALLS:([\s\S]*?)END_TOOL_CALLS/
      );
      let toolCalls = [];

      if (toolCallsMatch) {
        try {
          toolCalls = JSON.parse(toolCallsMatch[1].trim());
          console.log(
            chalk.gray(`[DEBUG] Parsed ${toolCalls.length} tool calls`)
          );
        } catch (e) {
          console.error(chalk.red("[DEBUG] Failed to parse tool calls:"), e);
        }
      }

      // Extract explanation
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
          this.displayResult(toolCall.name, result);
        } catch (error: any) {
          toolSpinner.fail(`Failed: ${error.message}`);
        }
      }
    } catch (error: any) {
      spinner.fail("Failed to process command");
      console.error(chalk.red("[DEBUG] Process command error:"), error);
    }
  }

  private displayResult(toolName: string, result: any): void {
    console.log(chalk.gray(`[DEBUG] Displaying results for ${toolName}`));

    try {
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
            });
          } else {
            console.log(chalk.yellow("\n📭 No emails found."));
          }
          break;

        case "list_labels":
          console.log(chalk.bold(`\n🏷️  Labels:\n`));
          result.forEach((label: any) => {
            console.log(chalk.white(`• ${label.name}`));
          });
          break;

        default:
          console.log(
            chalk.gray(
              "Result:",
              JSON.stringify(result, null, 2).substring(0, 200)
            )
          );
      }
    } catch (error) {
      console.error(chalk.red("[DEBUG] Display error:"), error);
    }
  }

  private showHelp(): void {
    console.log(chalk.bold("\n📧 Help\n"));
    console.log('Try: "show unread emails", "list my labels"');
  }

  async start(): Promise<void> {
    console.log(chalk.gray("[DEBUG] Starting CLI..."));

    console.log(chalk.bold.green("\n🚀 Gmail AI Assistant (Debug Mode)\n"));

    // Setup readline
    this.setupReadline();

    // Initialize Gmail service early to catch auth issues
    try {
      await this.initializeGmailService();
    } catch (error) {
      console.error(
        chalk.red("Failed to initialize Gmail. Check your authentication.")
      );
      // Continue anyway - let user fix auth
    }

    // Show prompt
    if (this.rl) {
      this.rl.prompt();
    } else {
      console.error(chalk.red("[DEBUG] Readline not initialized!"));
    }

    // Keep the process alive
    setInterval(() => {
      // Heartbeat to keep process alive
    }, 1000 * 60 * 60);
  }
}

// Error boundary for the entire app
process.on("uncaughtException", (error) => {
  console.error(chalk.red("[DEBUG] Uncaught exception:"), error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    chalk.red("[DEBUG] Unhandled rejection at:"),
    promise,
    "reason:",
    reason
  );
});

// Main
async function main() {
  try {
    console.log(chalk.gray("[DEBUG] Starting main..."));
    const cli = new GmailAICLI();
    await cli.start();
  } catch (error: any) {
    console.error(chalk.red("[DEBUG] Main error:"), error);
    // Keep trying
    setTimeout(main, 1000);
  }
}

main();
