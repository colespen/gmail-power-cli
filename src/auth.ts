import { authenticate } from "@google-cloud/local-auth";
import { google, gmail_v1 } from "googleapis";
import * as fs from "fs/promises";
import * as path from "path";
import { OAuth2Client } from "google-auth-library";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic"
];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

export async function loadSavedCredentialsIfExist(): Promise<OAuth2Client | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH, "utf-8");
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials) as OAuth2Client;
  } catch (err) {
    return null;
  }
}

export async function saveCredentials(client: OAuth2Client): Promise<void> {
  const content = await fs.readFile(CREDENTIALS_PATH, "utf-8");
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

export async function authorize(): Promise<OAuth2Client> {
  let client = await loadSavedCredentialsIfExist();

  if (client) {
    return client;
  }

  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });

  if (client.credentials) {
    await saveCredentials(client);
  }

  return client;
}

export async function getGmailService(): Promise<gmail_v1.Gmail> {
  const auth = await authorize();
  return google.gmail({ version: "v1", auth });
}

// Run this directly to set up authentication
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Setting up Gmail authentication...");
  await authorize();
  console.log("Authentication successful! Token saved.");
}
