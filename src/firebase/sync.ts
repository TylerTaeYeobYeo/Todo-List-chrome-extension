import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./config";

export interface Todo {
    id: string;
    text: string;
    completed: boolean;
    completedAt?: string;
}

export async function ensureUserDocument(userId: string) {
    try {
        const userDocRef = doc(db, "TODO_User", userId);
        const docSnap = await getDoc(userDocRef);
        // Create the document with default fields if it doesn't exist yet
        if (!docSnap.exists()) {
            await setDoc(userDocRef, {
                isPremium: false,
                premiumSince: null
            });
            console.log("Created initial TODO_User profile.");
        }
    } catch (error) {
        console.error("Error creating user document:", error);
    }
}

export async function isUserPro(userId: string): Promise<boolean> {
    try {
        const userDocRef = doc(db, "TODO_User", userId);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists() && docSnap.data().isPremium === true) {
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

// --- Sync Functions ---
export async function syncTasksToCloud(userId: string, todos: Todo[]) {
    try {
        const isPro = await isUserPro(userId);
        if (!isPro) return;

        const userDocRef = doc(db, "TODO_LIST_PREMIUM", userId);
        // Saving raw readable objects so the custom backend server can read it easily
        await setDoc(userDocRef, { todos }, { merge: true });
        console.log("Tasks synced to TODO_LIST_PREMIUM successfully.");
    } catch (error) {
        console.error("Error syncing tasks to cloud:", error);
    }
}

export async function pullTasksFromCloud(userId: string): Promise<Todo[] | null> {
    try {
        const isPro = await isUserPro(userId);
        if (!isPro) return null;

        const userDocRef = doc(db, "TODO_LIST_PREMIUM", userId);
        const docSnap = await getDoc(userDocRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.todos) {
                return data.todos as Todo[];
            }
        }
        return null;
    } catch (error) {
        console.error("Error pulling tasks from cloud:", error);
        return null;
    }
}
