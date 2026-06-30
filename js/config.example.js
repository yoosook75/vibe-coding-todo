/**
 * Firebase 설정 예시 — 이 파일을 복사해 js/config.js 로 저장한 뒤 값을 입력하세요.
 *
 *   cp js/config.example.js js/config.js   (Mac/Linux)
 *   copy js\config.example.js js\config.js (Windows)
 *
 * Firebase Console > 프로젝트 설정 > 일반 > 내 앱
 */
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxx",
};

/** Firebase 설정값이 실제로 입력되었는지 확인 */
export function isFirebaseConfigured(config = firebaseConfig) {
  if (!config || typeof config !== "object") return false;
  if (!config.apiKey || !config.projectId || !config.appId || !config.databaseURL) return false;
  if (config.apiKey === "YOUR_API_KEY") return false;
  if (config.appId === "YOUR_APP_ID") return false;
  return true;
}
