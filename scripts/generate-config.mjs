import { existsSync, writeFileSync } from "fs";

const ENV_KEYS = [
  ["FIREBASE_API_KEY", "apiKey"],
  ["FIREBASE_AUTH_DOMAIN", "authDomain"],
  ["FIREBASE_DATABASE_URL", "databaseURL"],
  ["FIREBASE_PROJECT_ID", "projectId"],
  ["FIREBASE_STORAGE_BUCKET", "storageBucket"],
  ["FIREBASE_MESSAGING_SENDER_ID", "messagingSenderId"],
  ["FIREBASE_APP_ID", "appId"],
];

// FIREBASE_DOMAIN 은 authDomain 별칭 (Firebase Console의 "도메인")
if (!process.env.FIREBASE_AUTH_DOMAIN?.trim() && process.env.FIREBASE_DOMAIN?.trim()) {
  process.env.FIREBASE_AUTH_DOMAIN = process.env.FIREBASE_DOMAIN;
}

const values = Object.fromEntries(
  ENV_KEYS.map(([envKey, configKey]) => [configKey, process.env[envKey]?.trim() || ""])
);

const allSet = ENV_KEYS.every(([envKey]) => Boolean(process.env[envKey]?.trim()));

if (!allSet) {
  if (existsSync("js/config.js")) {
    console.log("[generate-config] js/config.js already exists — skipping.");
    process.exit(0);
  }
  console.error(
    "[generate-config] Set FIREBASE_* environment variables or create js/config.js locally."
  );
  process.exit(1);
}

const contents = `/**
 * Auto-generated at build time — do not edit on Vercel.
 */
export const firebaseConfig = {
  apiKey: ${JSON.stringify(values.apiKey)},
  authDomain: ${JSON.stringify(values.authDomain)},
  databaseURL: ${JSON.stringify(values.databaseURL)},
  projectId: ${JSON.stringify(values.projectId)},
  storageBucket: ${JSON.stringify(values.storageBucket)},
  messagingSenderId: ${JSON.stringify(values.messagingSenderId)},
  appId: ${JSON.stringify(values.appId)},
};

export function isFirebaseConfigured(config = firebaseConfig) {
  if (!config || typeof config !== "object") return false;
  if (!config.apiKey || !config.projectId || !config.appId || !config.databaseURL) return false;
  if (config.apiKey === "YOUR_API_KEY") return false;
  if (config.appId === "YOUR_APP_ID") return false;
  return true;
}
`;

writeFileSync("js/config.js", contents, "utf8");
console.log("[generate-config] Wrote js/config.js from environment variables.");
