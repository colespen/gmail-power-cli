import { GmailService } from "./gmail-service.js";
import type {
  SearchEmailsArgs,
  ReadEmailArgs,
  SendEmailArgs,
  ModifyLabelsArgs,
  BatchOperationArgs,
  CreateLabelArgs,
} from "./schemas.js";

/**
 * Gmail MCP tool handlers
 * Each handler receives validated arguments
 */
export class GmailHandlers {
  constructor(private gmailService: GmailService) {}

  async searchEmails(args: SearchEmailsArgs): Promise<any> {
    return await this.gmailService.searchEmails(
      args.query,
      args.maxResults || 10
    );
  }

  async readEmail(args: ReadEmailArgs): Promise<any> {
    return await this.gmailService.readEmail(args.messageId);
  }

  async sendEmail(args: SendEmailArgs): Promise<any> {
    return await this.gmailService.sendEmail(args.to, args.subject, args.body, {
      cc: args.cc,
      bcc: args.bcc,
      threadId: args.threadId,
    });
  }

  async modifyLabels(args: ModifyLabelsArgs): Promise<any> {
    return await this.gmailService.modifyLabels(
      args.messageIds,
      args.addLabels,
      args.removeLabels
    );
  }

  async batchOperation(args: BatchOperationArgs): Promise<any> {
    return await this.gmailService.batchOperation(args.query, args.operation);
  }

  async createLabel(args: CreateLabelArgs): Promise<any> {
    return await this.gmailService.createLabel(args.name);
  }

  async listLabels(): Promise<any> {
    return await this.gmailService.listLabels();
  }
}
