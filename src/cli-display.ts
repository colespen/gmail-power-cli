import chalk from "chalk";
import { EmailMessage, Label } from "./cli-messages.js";

export class CLIDisplay {
  static showSearchResults(result: any): void {
    if (!result) {
      console.log(chalk.yellow("\n📭 No search results available."));
      return;
    }

    if (result.messages && result.messages.length > 0) {
      console.log(chalk.bold(`\n📧 Found ${result.messages.length} emails:\n`));

      result.messages.forEach((msg: EmailMessage, i: number) => {
        console.log(chalk.white(`${i + 1}. ${msg.subject || "(No subject)"}`));
        console.log(chalk.gray(`   From: ${msg.from}`));
        console.log(chalk.gray(`   Date: ${msg.date}`));

        if (msg.labelIds?.includes("UNREAD")) {
          console.log(chalk.yellow(`   📌 Unread`));
        }

        if (msg.snippet) {
          console.log(chalk.gray(`   Preview: ${msg.snippet.substring(0, 80)}...`));
        }

        console.log();
      });
    } else {
      console.log(chalk.yellow("\n📭 No emails found."));
    }
  }

  static showEmailContent(result: any): void {
    if (!result) {
      console.log(chalk.yellow("\n📖 No email content available."));
      return;
    }

    console.log(chalk.bold(`\n📖 Email Content:\n`));
    console.log(chalk.white(`Subject: ${result.subject || "(No subject)"}`));
    console.log(chalk.white(`From: ${result.from}`));
    console.log(chalk.white(`To: ${result.to}`));
    console.log(chalk.white(`Date: ${result.date}`));
    console.log(chalk.white(`\n--- Message ---\n`));

    const body = result.body || result.snippet || "";
    console.log(body.substring(0, 2000));

    if (body.length > 2000) {
      console.log(chalk.gray("\n... (truncated for display)"));
    }
  }

  static showLabelsModified(result: any): void {
    console.log(chalk.green(`\n✅ Labels updated successfully!`));
    const count = result.modified || result.results?.length || 1;
    console.log(chalk.gray(`Modified ${count} email${count > 1 ? "s" : ""}`));
  }

  static showLabelCreated(result: any): void {
    console.log(chalk.green(`\n✅ Label created successfully!`));
    console.log(chalk.white(`Label name: ${result.name}`));
  }

  static showFilterResult(result: any): void {
    if (result.cancelled) {
      console.log(chalk.yellow("\n❌ Filter creation cancelled"));
      return;
    }

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
          chalk.gray(`  Apply labels: ${result.action.addLabelIds.join(", ")}`)
        );
      }
      if (result.action.removeLabelIds) {
        console.log(
          chalk.gray(`  Remove labels: ${result.action.removeLabelIds.join(", ")}`)
        );
      }
    }
  }

  static showFiltersList(result: any[]): void {
    if (!result) {
      console.log(chalk.yellow("\n📋 No filters data available."));
      return;
    }

    console.log(chalk.bold("\n📋 Gmail Filters:\n"));

    if (result.length === 0) {
      console.log(chalk.gray("No filters found"));
      return;
    }

    result.forEach((filter: any, i: number) => {
      console.log(chalk.white(`${i + 1}. Filter ID: ${filter.id}`));
      if (filter.criteria) {
        console.log(chalk.gray("   Criteria:"));
        Object.entries(filter.criteria).forEach(([key, value]) => {
          console.log(chalk.gray(`     ${key}: ${value}`));
        });
      }
      if (filter.action) {
        console.log(chalk.gray("   Actions:"));
        Object.entries(filter.action).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            console.log(chalk.gray(`     ${key}: ${value.join(", ")}`));
          } else {
            console.log(chalk.gray(`     ${key}: ${value}`));
          }
        });
      }
      console.log();
    });
  }

  static showBatchOperationResult(result: any): void {
    if (result.cancelled) {
      console.log(chalk.yellow(`\n❌ Batch ${result.operation} cancelled`));
      return;
    }

    console.log(chalk.green(`\n✅ Batch operation completed!`));
    console.log(chalk.white(`Operation: ${result.operation}`));
    console.log(chalk.gray(`Affected ${result.affected} emails`));
  }

  static showSendEmailResult(result: any): void {
    console.log(chalk.green(`\n✅ Email sent successfully!`));
    if (result.id) {
      console.log(chalk.gray(`Message ID: ${result.id}`));
    }
  }

  static showLabelsList(labels: Label[]): void {
    if (!labels) {
      console.log(chalk.yellow("\n📋 No labels data available."));
      return;
    }

    console.log(chalk.bold(`\n📋 Gmail Labels:\n`));

    if (labels.length === 0) {
      console.log(chalk.gray("No labels found"));
      return;
    }

    labels.forEach((label: Label, i: number) => {
      console.log(chalk.white(`${i + 1}. ${label.name}`));
      console.log(chalk.gray(`   ID: ${label.id}`));
      if (label.type) {
        console.log(chalk.gray(`   Type: ${label.type}`));
      }
      console.log();
    });
  }
}