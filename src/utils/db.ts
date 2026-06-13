import { InterviewSession } from './interviewStorage';

const DB_NAME = 'intervox_db';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

/**
 * Initializes the IndexedDB database and sets up object stores/indexes.
 */
export function initDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('❌ Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        console.log('✅ IndexedDB initialized successfully');
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        
        // Sessions Store
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('date', 'date', { unique: false });
          sessionStore.createIndex('domain', 'domain', { unique: false });
          sessionStore.createIndex('difficulty', 'difficulty', { unique: false });
          console.log('📦 Created sessions store');
        }

        // Settings Store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
          console.log('📦 Created settings store');
        }

        // Analytics Store
        if (!db.objectStoreNames.contains('analytics')) {
          const analyticsStore = db.createObjectStore('analytics', { keyPath: 'id' });
          analyticsStore.createIndex('date', 'date', { unique: false });
          console.log('📦 Created analytics store');
        }
      };
    } catch (error) {
      console.error('❌ Exception in initDB:', error);
      reject(error);
    }
  });
}

/**
 * Gets the database instance, initializing it if necessary.
 */
async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  return await initDB();
}

/**
 * Auto-maps a role string to a domain category.
 */
function deriveDomain(role: string): string {
  const r = role.toLowerCase();
  if (r.includes('frontend') || r.includes('ux') || r.includes('ui') || r.includes('design')) {
    return 'Frontend';
  }
  if (r.includes('ml') || r.includes('machine learning') || r.includes('artificial intelligence') || r.includes('ai')) {
    return 'ML';
  }
  if (r.includes('data science') || r.includes('analyst') || r.includes('analytics') || r.includes('data scientist')) {
    return 'Data Science';
  }
  if (r.includes('devops') || r.includes('cloud') || r.includes('infrastructure') || r.includes('sre')) {
    return 'DevOps';
  }
  // Fallback to Backend for general engineering
  return 'Backend';
}

/**
 * Puts a session into the 'sessions' store.
 */
export async function saveSession(session: InterviewSession): Promise<void> {
  try {
    const db = await getDB();
    
    // Ensure the session has a domain field
    if (!session.domain) {
      session.domain = deriveDomain(session.role);
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sessions', 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.put(session);

      request.onsuccess = () => {
        console.log(`💾 Session ${session.id} saved to IndexedDB`);
        resolve();
      };

      request.onerror = () => {
        console.error(`❌ Error saving session ${session.id}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('❌ Exception in saveSession:', error);
    throw error;
  }
}

/**
 * Gets all records from 'sessions', sorted by date descending.
 */
export async function getAllSessions(): Promise<InterviewSession[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sessions', 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.getAll();

      request.onsuccess = () => {
        const sessions = request.result as InterviewSession[];
        // Sort by timestamp descending or date descending
        sessions.sort((a, b) => {
          const timeA = a.timestamp || (a.date ? new Date(a.date).getTime() : 0);
          const timeB = b.timestamp || (b.date ? new Date(b.date).getTime() : 0);
          return timeB - timeA;
        });
        resolve(sessions);
      };

      request.onerror = () => {
        console.error('❌ Error getting all sessions:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('❌ Exception in getAllSessions:', error);
    return [];
  }
}

/**
 * Gets one session by id.
 */
export async function getSession(id: string): Promise<InterviewSession | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sessions', 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error(`❌ Error fetching session ${id}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error(`❌ Exception in getSession for ${id}:`, error);
    return null;
  }
}

/**
 * Deletes one session by id.
 */
export async function deleteSession(id: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sessions', 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`🗑️ Deleted session ${id} from IndexedDB`);
        resolve();
      };

      request.onerror = () => {
        console.error(`❌ Error deleting session ${id}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error(`❌ Exception in deleteSession for ${id}:`, error);
    throw error;
  }
}

/**
 * Retrieves a setting string value.
 */
export async function getSetting(key: string): Promise<string | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('settings', 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);

      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? record.value : null);
      };

      request.onerror = () => {
        console.error(`❌ Error fetching setting ${key}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error(`❌ Exception in getSetting for ${key}:`, error);
    return null;
  }
}

/**
 * Saves a setting string value.
 */
export async function saveSetting(key: string, value: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('settings', 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({ key, value });

      request.onsuccess = () => {
        console.log(`⚙️ Saved setting ${key} = ${value}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`❌ Error saving setting ${key}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error(`❌ Exception in saveSetting for ${key}:`, error);
    throw error;
  }
}

/**
 * Migrates old data from localStorage to IndexedDB on first run.
 */
export async function migrateFromLocalStorage(): Promise<void> {
  try {
    const isMigrated = localStorage.getItem('intervox_migrated');
    if (isMigrated === 'true') {
      return; // Already migrated
    }

    console.log('🔄 First run detected: Migrating localStorage data to IndexedDB...');
    const db = await getDB();

    // Migrate Sessions
    const sessionsKey = 'intervox_interview_history';
    const oldSessionsStr = localStorage.getItem(sessionsKey) || localStorage.getItem('intervox_sessions');
    if (oldSessionsStr) {
      try {
        const oldSessions = JSON.parse(oldSessionsStr);
        if (Array.isArray(oldSessions)) {
          console.log(`📦 Found ${oldSessions.length} sessions to migrate...`);
          for (const s of oldSessions) {
            // derive domain if not exists
            if (!s.domain) {
              s.domain = deriveDomain(s.role || '');
            }
            await saveSession(s);
          }
        }
      } catch (err) {
        console.error('❌ Error parsing/migrating old sessions:', err);
      }
    }

    // Migrate Settings (e.g. voice preference)
    const voicePref = localStorage.getItem('intervox_voice_preference');
    if (voicePref) {
      await saveSetting('intervox_voice_preference', voicePref);
    }
    
    const settingsStr = localStorage.getItem('intervox_settings');
    if (settingsStr) {
      try {
        const oldSettings = JSON.parse(settingsStr);
        if (typeof oldSettings === 'object' && oldSettings !== null) {
          for (const [key, val] of Object.entries(oldSettings)) {
            await saveSetting(key, String(val));
          }
        }
      } catch (err) {
        console.error('❌ Error parsing/migrating old settings:', err);
      }
    }

    // Cleanup localStorage keys to avoid duplicate migration
    localStorage.removeItem(sessionsKey);
    localStorage.removeItem('intervox_sessions');
    localStorage.removeItem('intervox_settings');
    localStorage.setItem('intervox_migrated', 'true');
    console.log('✅ LocalStorage migration completed successfully!');
  } catch (error) {
    console.error('❌ Exception during local storage migration:', error);
  }
}

/**
 * Clears all object stores in IndexedDB.
 */
export async function clearAllData(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions', 'settings', 'analytics'], 'readwrite');
      transaction.objectStore('sessions').clear();
      transaction.objectStore('settings').clear();
      transaction.objectStore('analytics').clear();
      
      transaction.oncomplete = () => {
        console.log('🧹 IndexedDB cleared completely');
        resolve();
      };
      
      transaction.onerror = () => {
        console.error('❌ Failed to clear IndexedDB:', transaction.error);
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('❌ Exception in clearAllData:', error);
    throw error;
  }
}

