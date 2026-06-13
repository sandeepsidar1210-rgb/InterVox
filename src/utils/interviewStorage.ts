import * as db from './db';

export interface InterviewSession {
  id: string;
  date: string;
  dateShort: string;
  timestamp: number;
  role: string;
  domain?: string;
  level: string;
  difficulty: 'easy' | 'medium' | 'hard';
  score: number;
  duration: string;
  questions: number;
  questionsAnswered: number;
  // Detailed data
  fullData?: {
    questions: any[];
    answers: string[];
    evaluations: any[];
    communicationAnalytics?: any[];
    interviewConfig: any;
  };
}

/**
 * Get all interview sessions from IndexedDB
 */
export const getInterviewHistory = async (): Promise<InterviewSession[]> => {
  try {
    return await db.getAllSessions();
  } catch (error) {
    console.error('Error loading interview history:', error);
    return [];
  }
};

/**
 * Save a new interview session
 */
export const saveInterviewSession = async (
  session: Omit<InterviewSession, 'id' | 'timestamp'>
): Promise<InterviewSession> => {
  try {
    const newSession: InterviewSession = {
      ...session,
      id: `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    
    await db.saveSession(newSession);
    console.log('✅ Interview session saved to history:', newSession.id);
    return newSession;
  } catch (error) {
    console.error('Error saving interview session:', error);
    throw error;
  }
};

/**
 * Delete an interview session
 */
export const deleteInterviewSession = async (id: string): Promise<boolean> => {
  try {
    await db.deleteSession(id);
    console.log('🗑️ Interview session deleted:', id);
    return true;
  } catch (error) {
    console.error('Error deleting interview session:', error);
    return false;
  }
};

/**
 * Get a specific interview session by ID
 */
export const getInterviewSession = async (id: string): Promise<InterviewSession | null> => {
  try {
    return await db.getSession(id);
  } catch (error) {
    console.error('Error getting interview session:', error);
    return null;
  }
};

/**
 * Get statistics from interview history
 */
export const getHistoryStats = async () => {
  try {
    const history = await db.getAllSessions();
    
    if (history.length === 0) {
      return {
        totalSessions: 0,
        averageScore: 0,
        bestScore: 0,
        recentTrend: 0,
      };
    }
    
    const totalSessions = history.length;
    const averageScore = Math.round(
      history.reduce((sum, s) => sum + s.score, 0) / totalSessions
    );
    const bestScore = Math.max(...history.map(s => s.score));
    
    // Calculate trend (comparing last 3 to previous 3)
    const recent = history.slice(0, 3);
    const previous = history.slice(3, 6);
    const recentAvg = recent.length > 0 
      ? recent.reduce((sum, s) => sum + s.score, 0) / recent.length 
      : 0;
    const previousAvg = previous.length > 0 
      ? previous.reduce((sum, s) => sum + s.score, 0) / previous.length 
      : 0;
    const recentTrend = recentAvg - previousAvg;
    
    return {
      totalSessions,
      averageScore,
      bestScore,
      recentTrend,
    };
  } catch (error) {
    console.error('Error getting history stats:', error);
    return {
      totalSessions: 0,
      averageScore: 0,
      bestScore: 0,
      recentTrend: 0,
    };
  }
};

