// currently not in use - using Gemini (free tier available)
import "dotenv/config";
import { Anthropic } from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources";
import { spawn } from "child_process";
import * as readline from "readline";
import chalk from "chalk";
import ora from "ora";
// import * as fs from "fs/promises";
import * as path from "path";

interface ToolCall {
  name: string;
  arguments: any;
}

class GmailAICLI {
  private anthropic: Anthropic;
  private rl: readline.Interface;
  private context: MessageParam[] = [];

  constructor() {
    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error(
        chalk.red("Error: ANTHROPIC_API_KEY environment variable not set")
      );
      console.log(
        chalk.yellow("Get your API key from: https://console.anthropic.com/")
      );
      console.log(
        chalk.yellow('Then run: export ANTHROPIC_API_KEY="your-key-here"')
      );
      process.exit(1);
    }

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.blue("Gmail AI > "),
    });
  }

  private async callMCPTool(toolName: string, args: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const mcpProcess = spawn("node", [
        path.join(process.cwd(), "dist/mcp-server.js"),
      ]);

      let responseData = "";
      let errorData = "";

      mcpProcess.stdout.on("data", (data) => {
        responseData += data.toString();
      });

      mcpProcess.stderr.on("data", (data) => {
        errorData += data.toString();
      });

      mcpProcess.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(errorData || "MCP tool call failed"));
        } else {
          try {
            const lines = responseData
              .split("\n")
              .filter((line) => line.trim());
            const lastLine = lines[lines.length - 1];
            resolve(JSON.parse(lastLine));
          } catch (e) {
            resolve(responseData);
          }
        }
      });

      // Send tool call request
      const request = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
        id: 1,
      };

      mcpProcess.stdin.write(JSON.stringify(request) + "\n");
      mcpProcess.stdin.end();
    });
  }

  private getSystemPrompt(): string {
    return `You are a helpful Gmail assistant with access to the user's Gmail account through MCP tools.

Available tools:
1. search_emails - Search for emails using Gmail query syntax
   - query: Gmail search query (e.g., "is:unread", "from:user@example.com")
   - maxResults: Maximum number of results (default: 10)

2. read_email - Read the full content of an email
   - messageId: The ID of the email message

3. send_email - Send a new email or reply
   - to: Array of recipient emails
   - subject: Email subject
   - body: Email body
   - cc: Optional CC recipients
   - threadId: Optional for replies

4. modify_labels - Add or remove labels
   - messageIds: Array of message IDs
   - addLabels: Labels to add (e.g., ["STARRED", "IMPORTANT"])
   - removeLabels: Labels to remove (e.g., ["UNREAD", "INBOX"])

5. batch_operation - Perform operations on multiple emails
   - query: Gmail search query
   - operation: One of "archive", "delete", "markRead", "markUnread", "star", "unstar"

6. list_labels - List all available labels
7. create_label - Create a new label
   - name: Label name

When users make requests:
1. Understand their intent and map it to appropriate tool calls
2. Use Gmail search syntax for queries (is:unread, from:, subject:, has:attachment, etc.)
3. Chain multiple tools if needed
4. Provide clear, helpful responses about what you did
5. Ask for clarification if the request is ambiguous

Always format your response with tool calls as JSON in this exact format:
TOOL_CALLS:
[
  {
    "name": "tool_name",
    "arguments": { ... }
  }
]
END_TOOL_CALLS

Then provide a natural language explanation of what you're doing.`;
  }

  private extractToolCalls(response: string): ToolCall[] {
    const toolCallsMatch = response.match(
      /TOOL_CALLS:([\s\S]*?)END_TOOL_CALLS/
    );
    if (toolCallsMatch) {
      try {
        return JSON.parse(toolCallsMatch[1].trim());
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  private extractExplanation(response: string): string {
    return response.replace(/TOOL_CALLS:[\s\S]*?END_TOOL_CALLS/, "").trim();
  }

  async processCommand(input: string): Promise<void> {
    const spinner = ora("Thinking...").start();

    try {
      // Get AI interpretation
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        system: this.getSystemPrompt(),
        messages: [...this.context, { role: "user", content: input }],
      });

      spinner.stop();

      const responseText =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Extract tool calls and explanation
      const toolCalls = this.extractToolCalls(responseText);
      const explanation = this.extractExplanation(responseText);

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

          // Display results in a formatted way
          if (typeof result === "object") {
            console.log(chalk.gray(JSON.stringify(result, null, 2)));
          } else {
            console.log(chalk.gray(result));
          }
        } catch (error) {
          toolSpinner.fail(`Failed to execute ${toolCall.name}`);
          console.error(chalk.red(error));
        }
      }

      // Add to context for follow-up commands
      this.context.push(
        { role: "user", content: input },
        { role: "assistant", content: responseText }
      );

      // Keep context size manageable
      if (this.context.length > 10) {
        this.context = this.context.slice(-10);
      }
    } catch (error) {
      spinner.fail("Failed to process command");
      console.error(chalk.red(error));
    }
  }

  async start(): Promise<void> {
    console.log(chalk.bold.green("\n🚀 Gmail AI Assistant"));
    console.log(
      chalk.gray("Natural language Gmail control powered by Claude\n")
    );

    console.log(chalk.yellow("Example commands:"));
    console.log('  • "Show me unread emails from this week"');
    console.log('  • "Search for emails about meetings tomorrow"');
    console.log('  • "Archive all promotional emails"');
    console.log('  • "Star important emails from my boss"');
    console.log('  • "Send an email to john@example.com about lunch"');
    console.log('\nType "help" for more examples or "exit" to quit\n');

    this.rl.prompt();

    this.rl.on("line", async (line) => {
      const input = line.trim();

      if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
        console.log(chalk.yellow("\nGoodbye! 👋"));
        process.exit(0);
      }

      if (input.toLowerCase() === "help") {
        this.showHelp();
      } else if (input) {
        await this.processCommand(input);
      }

      this.rl.prompt();
    });

    this.rl.on("close", () => {
      console.log(chalk.yellow("\nGoodbye! 👋"));
      process.exit(0);
    });
  }

  private showHelp(): void {
    console.log(chalk.bold("\n📧 Gmail AI Assistant - Help\n"));

    console.log(chalk.underline("Search Examples:"));
    console.log('  • "Find unread emails"');
    console.log('  • "Show emails from John Smith"');
    console.log('  • "Search for emails with attachments"');
    console.log('  • "Find emails about project alpha from last week"');

    console.log(chalk.underline("\nAction Examples:"));
    console.log('  • "Archive all emails from newsletter@example.com"');
    console.log('  • "Mark all emails as read"');
    console.log('  • "Star the latest email from my manager"');
    console.log('  • "Delete old promotional emails"');

    console.log(chalk.underline("\nLabel Examples:"));
    console.log('  • "Create a label called Work"');
    console.log('  • "Add label Important to unread emails"');
    console.log('  • "Show me all my labels"');

    console.log(chalk.underline("\nSending Emails:"));
    console.log('  • "Send an email to alice@example.com about the meeting"');
    console.log('  • "Reply to the last email from Bob"');

    console.log(
      chalk.gray(
        "\nTip: You can use natural language - the AI will understand!\n"
      )
    );
  }
}

// Start the CLI
const cli = new GmailAICLI();
cli.start().catch(console.error);
