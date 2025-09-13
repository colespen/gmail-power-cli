import chalk from "chalk";
import inquirer from "inquirer";
import * as readline from "readline";

export interface EmailMessage {
  id: string;
  threadId?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  snippet?: string;
  labelIds?: string[];
}

export interface Label {
  id: string;
  name: string;
  type?: string;
}

export class CLIMessages {
  static showWelcome(): void {
    console.clear();
    console.log(chalk.bold.green("╔════════════════════════════════════════╗"));
    console.log(chalk.bold.green("║     📨 Gmail AI Assistant              ║"));
    console.log(chalk.bold.green("║     Powered by Groq (Llama 3.3)        ║"));
    console.log(chalk.bold.green("╚════════════════════════════════════════╝"));
    console.log();
    console.log(chalk.cyan("Natural language Gmail control - Fast & Free!"));
    console.log(chalk.gray('Try: "show my unread emails" or "help" for more\n'));
  }

  static showGmailConnected(): void {
    console.log(chalk.green("✓ Connected to Gmail\n"));
  }

  static showGmailAuthNeeded(): void {
    console.error(chalk.yellow("⚠️  Gmail auth needed. Run: npm run auth\n"));
  }

  static showApiKeyError(): void {
    console.error(chalk.red("Error: GROQ_API_KEY environment variable not set"));
    console.log(chalk.yellow("Get your FREE API key from: https://console.groq.com"));
    console.log(chalk.yellow('Then add to .env: GROQ_API_KEY="your-key-here"'));
  }

  static showGoodbye(): void {
    console.log(chalk.yellow("\nGoodbye! 👋\n"));
  }

  static showClearScreen(): void {
    console.clear();
    console.log(chalk.green("🚀 Gmail AI Assistant\n"));
  }

  static showError(message: string): void {
    console.error(chalk.red("Error: " + message));
  }

  static showWarning(message: string): void {
    console.log(chalk.yellow(`Warning: ${message}`));
  }

  static showRateLimit(): void {
    console.log(
      chalk.yellow("\n💡 Groq service tier `on_demand` tokens per day (TPD): Limit 100000.")
    );
  }

  static showDebugInfo(toolName: string, args: any): void {
    let argsString: string;
    try {
      argsString = JSON.stringify(args, null, 2);
    } catch (error) {
      // Handle circular references or other JSON serialization issues
      argsString = '[Complex Object - Cannot Display]';
    }
    console.log(
      chalk.gray(`Debug: ${toolName} args:`, argsString)
    );
  }

  static showAssistantResponse(content: string): void {
    console.log(chalk.cyan("\n" + content));
  }

  static showHelp(): void {
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

  static async confirmAction(action: string, details: string): Promise<boolean> {
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

    return confirm;
  }

  static showPrompt(): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(chalk.blue("\nGmail AI > "), (answer: string) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
}