console.log("Background script running");

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase/config";
import { ensureUserDocument, pullTasksFromCloud, syncTasksToCloud, Todo } from "./firebase/sync";

const STORAGE_KEY = "bun_todos";

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

// Watch for authentication state changes
onAuthStateChanged(auth, async (user) => {
  if (user) {
    console.log("User logged in, ensuring profile and syncing tasks...");
    await ensureUserDocument(user.uid);
    const cloudTodos = await pullTasksFromCloud(user.uid);
    if (cloudTodos) {
      // Current simple strategy: overwrite local with cloud. 
      // A robust strategy would merge them, but for a quick todo list, this is a start.
      // E.g., merge logic based on timestamps or simply prefer cloud on fresh login.
      await chrome.storage.sync.set({ [STORAGE_KEY]: cloudTodos });
      console.log("Tasks pulled from cloud and saved locally");
    }
  }
});

// Watch for local changes to trigger cloud upload
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "sync" && changes[STORAGE_KEY]) {
    const user = auth.currentUser;
    if (user) {
      console.log("Local tasks changed, syncing to cloud...");
      const todos = (changes[STORAGE_KEY].newValue as Todo[]) || [];
      await syncTasksToCloud(user.uid, todos);
    }
  }
});
