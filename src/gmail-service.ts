import { gmail_v1 } from "googleapis";
import { getGmailService } from "./auth.js";

export class GmailService {
  private gmail: gmail_v1.Gmail | null = null;

  async initialize(): Promise<void> {
    this.gmail = await getGmailService();
  }

  private ensureInitialized(): gmail_v1.Gmail {
    if (!this.gmail) {
      throw new Error("GmailService not initialized. Call initialize() first.");
    }
    return this.gmail;
  }

  async searchEmails(query: string, maxResults: number = 10) {
    const gmail = this.ensureInitialized();

    try {
      const response = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults,
      });

      if (!response.data.messages) {
        return { messages: [], query };
      }

      // get basic info for each message
      const messages = await Promise.all(
        response.data.messages.slice(0, maxResults).map(async (msg) => {
          const details = await gmail.users.messages.get({
            userId: "me",
            id: msg.id!,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"],
          });

          const headers = details.data.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name === name)?.value || "";

          return {
            id: msg.id,
            threadId: msg.threadId,
            subject: getHeader("Subject"),
            from: getHeader("From"),
            to: getHeader("To"),
            date: getHeader("Date"),
            snippet: details.data.snippet,
            labelIds: details.data.labelIds,
          };
        })
      );

      return { messages, query, total: response.data.resultSizeEstimate };
    } catch (error) {
      throw new Error(`Failed to search emails: ${error}`);
    }
  }

  async readEmail(messageId: string) {
    const gmail = this.ensureInitialized();

    try {
      const response = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const message = response.data;
      const headers = message.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name === name)?.value || "";

      // extract body
      let body = "";
      const extractBody = (parts: any[]): void => {
        for (const part of parts) {
          if (part.mimeType === "text/plain" && part.body?.data) {
            body += Buffer.from(part.body.data, "base64").toString("utf-8");
          } else if (part.parts) {
            extractBody(part.parts);
          }
        }
      };

      if (message.payload?.parts) {
        extractBody(message.payload.parts);
      } else if (message.payload?.body?.data) {
        body = Buffer.from(message.payload.body.data, "base64").toString(
          "utf-8"
        );
      }

      return {
        id: message.id,
        threadId: message.threadId,
        subject: getHeader("Subject"),
        from: getHeader("From"),
        to: getHeader("To"),
        cc: getHeader("Cc"),
        date: getHeader("Date"),
        body: body || message.snippet || "",
        snippet: message.snippet,
        labelIds: message.labelIds,
        attachments: message.payload?.parts
          ?.filter((p) => p.filename && p.body?.attachmentId)
          .map((p) => ({
            filename: p.filename,
            mimeType: p.mimeType,
            size: p.body?.size,
            attachmentId: p.body?.attachmentId,
          })),
      };
    } catch (error) {
      throw new Error(`Failed to read email: ${error}`);
    }
  }

  async modifyLabels(
    messageIds: string[],
    addLabels: string[] = [],
    removeLabels: string[] = []
  ) {
    const gmail = this.ensureInitialized();

    try {
      const results = await Promise.all(
        messageIds.map(async (messageId) => {
          const response = await gmail.users.messages.modify({
            userId: "me",
            id: messageId,
            requestBody: {
              addLabelIds: addLabels,
              removeLabelIds: removeLabels,
            },
          });
          return { messageId, success: true, labels: response.data.labelIds };
        })
      );

      return { results, modified: results.length };
    } catch (error) {
      throw new Error(`Failed to modify labels: ${error}`);
    }
  }

  async sendEmail(
    to: string[],
    subject: string,
    body: string,
    options: {
      cc?: string[];
      bcc?: string[];
      threadId?: string;
      replyTo?: string;
    } = {}
  ) {
    const gmail = this.ensureInitialized();

    try {
      // Create email message
      const messageParts = [`To: ${to.join(", ")}`, `Subject: ${subject}`];

      if (options.cc?.length) {
        messageParts.push(`Cc: ${options.cc.join(", ")}`);
      }
      if (options.bcc?.length) {
        messageParts.push(`Bcc: ${options.bcc.join(", ")}`);
      }
      if (options.replyTo) {
        messageParts.push(`In-Reply-To: ${options.replyTo}`);
        messageParts.push(`References: ${options.replyTo}`);
      }

      messageParts.push("Content-Type: text/plain; charset=utf-8", "", body);

      const message = messageParts.join("\n");
      const encodedMessage = Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedMessage,
          threadId: options.threadId,
        },
      });

      return {
        id: response.data.id,
        threadId: response.data.threadId,
        labelIds: response.data.labelIds,
        success: true,
      };
    } catch (error) {
      throw new Error(`Failed to send email: ${error}`);
    }
  }

  async batchOperation(query: string, operation: string) {
    const gmail = this.ensureInitialized();

    try {
      // First, get all messages matching the query
      const searchResult = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 100,
      });

      if (!searchResult.data.messages) {
        return { affected: 0, operation, query };
      }

      const messageIds = searchResult.data.messages.map((m) => m.id!);

      // Perform operation based on type
      switch (operation) {
        case "archive":
          await this.modifyLabels(messageIds, [], ["INBOX"]);
          break;
        case "delete":
          await Promise.all(
            messageIds.map((id) =>
              gmail.users.messages.trash({ userId: "me", id })
            )
          );
          break;
        case "markRead":
          await this.modifyLabels(messageIds, [], ["UNREAD"]);
          break;
        case "markUnread":
          await this.modifyLabels(messageIds, ["UNREAD"], []);
          break;
        case "star":
          await this.modifyLabels(messageIds, ["STARRED"], []);
          break;
        case "unstar":
          await this.modifyLabels(messageIds, [], ["STARRED"]);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      return {
        affected: messageIds.length,
        operation,
        query,
        messageIds,
      };
    } catch (error) {
      throw new Error(`Failed to perform batch operation: ${error}`);
    }
  }

  async listLabels() {
    const gmail = this.ensureInitialized();

    try {
      const response = await gmail.users.labels.list({
        userId: "me",
      });

      return response.data.labels || [];
    } catch (error) {
      throw new Error(`Failed to list labels: ${error}`);
    }
  }

  async createLabel(name: string) {
    const gmail = this.ensureInitialized();

    try {
      const response = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to create label: ${error}`);
    }
  }

  async createFilter(criteria: any, action: any) {
    const gmail = this.ensureInitialized();

    try {
      // build the filter object
      const filter = {
        criteria: {},
        action: {},
      } as any;

      // map criteria
      if (criteria.from) {
        filter.criteria.from = criteria.from;
      }
      if (criteria.to) {
        filter.criteria.to = criteria.to;
      }
      if (criteria.subject) {
        filter.criteria.subject = criteria.subject;
      }
      if (criteria.query) {
        filter.criteria.query = criteria.query;
      }
      if (criteria.hasAttachment !== undefined) {
        filter.criteria.hasAttachment = criteria.hasAttachment;
      }

      // map actions
      if (action.addLabelIds) {
        filter.action.addLabelIds = action.addLabelIds;
      }
      if (action.removeLabelIds) {
        filter.action.removeLabelIds = action.removeLabelIds;
      }
      if (action.forward) {
        filter.action.forward = action.forward;
      }

      const response = await gmail.users.settings.filters.create({
        userId: "me",
        requestBody: filter,
      });

      return {
        id: response.data.id,
        criteria: response.data.criteria,
        action: response.data.action,
      };
    } catch (error) {
      throw new Error(`Failed to create filter: ${error}`);
    }
  }

  async listFilters() {
    const gmail = this.ensureInitialized();

    try {
      const response = await gmail.users.settings.filters.list({
        userId: "me",
      });

      return response.data.filter || [];
    } catch (error) {
      throw new Error(`Failed to list filters: ${error}`);
    }
  }

  async deleteFilter(filterId: string) {
    const gmail = this.ensureInitialized();

    try {
      await gmail.users.settings.filters.delete({
        userId: "me",
        id: filterId,
      });

      return { success: true, filterId };
    } catch (error) {
      throw new Error(`Failed to delete filter: ${error}`);
    }
  }
}
