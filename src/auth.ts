import { authenticate } from "@google-cloud/local-auth";
import { google, gmail_v1 } from "googleapis";
import { OAuth2Client as GoogleApisOAuth2Client } from "googleapis-common";
import { OAuth2Client as GoogleAuthOAuth2Client } from "google-auth-library";
import * as fs from "fs/promises";
import * as path from "path";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic"
];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

export async function loadSavedCredentialsIfExist(): Promise<GoogleApisOAuth2Client | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH, "utf-8");
    const credentials = JSON.parse(content);
    const auth = google.auth.fromJSON(credentials);
    if (auth instanceof GoogleApisOAuth2Client) {
      return auth;
    }
    return null;
  } catch (err) {
    return null;
  }
}

export async function saveCredentials(client: GoogleAuthOAuth2Client): Promise<void> {
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

export async function authorize(): Promise<GoogleApisOAuth2Client> {
  let client = await loadSavedCredentialsIfExist();

  if (client) {
    return client;
  }

  const authClient = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });

  if (!(authClient instanceof GoogleAuthOAuth2Client)) {
    throw new Error("Authentication did not return OAuth2Client");
  }

  if (authClient.credentials) {
    await saveCredentials(authClient);
  }

  // Convert from google-auth-library OAuth2Client to googleapis-common OAuth2Client
  // by creating a new GoogleAuth instance and getting the client
  const refreshToken = authClient.credentials.refresh_token;
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }
  
  const googleAuth = google.auth.fromJSON({
    type: "authorized_user",
    client_id: authClient._clientId,
    client_secret: authClient._clientSecret,
    refresh_token: refreshToken,
  });

  if (googleAuth instanceof GoogleApisOAuth2Client) {
    return googleAuth;
  }
  
  throw new Error("Failed to convert auth client to googleapis-compatible format");
}

export async function getGmailService(): Promise<gmail_v1.Gmail> {
  const auth = await authorize();
  return google.gmail({ version: "v1", auth: auth });
}

// Run this directly to set up authentication
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Setting up Gmail authentication...");
  await authorize();
  console.log("Authentication successful! Token saved.");
}
