import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./config";

export interface Todo {
    id: string;
    text: string;
    completed: boolean;
    completedAt?: string;
}

export async function syncTasksToCloud(userId: string, todos: Todo[]) {
    try {
        const userDocRef = doc(db, "users", userId);
        await setDoc(userDocRef, { todos }, { merge: true });
        console.log("Tasks synced to cloud successfully.");
    } catch (error) {
        console.error("Error syncing tasks to cloud:", error);
    }
}

export async function pullTasksFromCloud(userId: string): Promise<Todo[] | null> {
    try {
        const userDocRef = doc(db, "users", userId);
        const docSnap = await getDoc(userDocRef);
        
        if (docSnap.exists()) {
            return docSnap.data().todos as Todo[];
        }
        return null;
    } catch (error) {
        console.error("Error pulling tasks from cloud:", error);
        return null;
    }
}
