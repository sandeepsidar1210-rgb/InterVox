import { BrowserRouter, Routes, Route, useLocation } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ProgressBar, ErrorBoundary, ProtectedRoute } from "./components";
import LandingPage from "./pages/LandingPage";
import DashboardLayout from "./pages/DashboardLayout";
import DashboardHome from "./pages/DashboardHome";
import Practice from "./pages/Practice";
import History from "./pages/History";
import Analytics from "./pages/Analytics";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import LiveInterview from "./pages/LiveInterview";
import InterviewResults from "./pages/InterviewResults";
import AIPracticePage from "./pages/AIPracticePage";
import CommunicationPracticePage from "./pages/CommunicationPracticePage";
import BlogPage from "./pages/BlogPage";
import AuthPage from "./pages/AuthPage";
import LogoutPage from "./pages/LogoutPage";
import { VoiceRecognitionTest } from "./components/VoiceRecognitionTest";
import CompareSessionsPage from "./pages/CompareSessionsPage";
import VoiceInterviewPage from "./pages/VoiceInterviewPage";

const pageVariants = {
  initial: { opacity: 0, y: 16, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } },
  exit:    { opacity: 0, y: -10, filter: 'blur(4px)', transition: { duration: 0.2 } }
};

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full flex-1 flex flex-col min-h-0"
    >
      {children}
    </motion.div>
  );
}

function AppContent() {
  const location = useLocation();

  return (
    <>
      <ProgressBar />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageWrapper><LandingPage /></PageWrapper>} />
          <Route path="/auth" element={<PageWrapper><AuthPage /></PageWrapper>} />
          <Route path="/logout" element={<PageWrapper><LogoutPage /></PageWrapper>} />

          {/* Protected Routes */}
          <Route path="/ai-practice" element={<ProtectedRoute><PageWrapper><AIPracticePage /></PageWrapper></ProtectedRoute>} />
          <Route path="/communication-practice" element={<ProtectedRoute><PageWrapper><CommunicationPracticePage /></PageWrapper></ProtectedRoute>} />
          <Route path="/blog" element={<ProtectedRoute><PageWrapper><BlogPage /></PageWrapper></ProtectedRoute>} />
          <Route path="/voice-test" element={<ProtectedRoute><PageWrapper><VoiceRecognitionTest /></PageWrapper></ProtectedRoute>} />
          
          <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<PageWrapper><DashboardHome /></PageWrapper>} />
            <Route path="practice" element={<PageWrapper><Practice /></PageWrapper>} />
            <Route path="analytics" element={<PageWrapper><Analytics /></PageWrapper>} />
            <Route path="history" element={<PageWrapper><History /></PageWrapper>} />
            <Route path="profile" element={<PageWrapper><Profile /></PageWrapper>} />
            <Route path="settings" element={<PageWrapper><Settings /></PageWrapper>} />
          </Route>
          
          <Route path="/interview-live" element={<ProtectedRoute><PageWrapper><LiveInterview /></PageWrapper></ProtectedRoute>} />
          <Route path="/interview" element={<ProtectedRoute><PageWrapper><VoiceInterviewPage /></PageWrapper></ProtectedRoute>} />
          <Route path="/interview-results" element={<ProtectedRoute><PageWrapper><InterviewResults /></PageWrapper></ProtectedRoute>} />
          <Route path="/compare" element={<ProtectedRoute><PageWrapper><CompareSessionsPage /></PageWrapper></ProtectedRoute>} />
        </Routes>
      </AnimatePresence>
    </>
  );
}

import { useEffect } from "react";
import { initDB, migrateFromLocalStorage } from "../utils/db";
import { supabase } from "../utils/supabase";
import { ToastProvider } from "../hooks/useToast";

export default function App() {
  useEffect(() => {
    const setupDB = async () => {
      try {
        await initDB();
        await migrateFromLocalStorage();
      } catch (err) {
        console.error("Failed to initialize database:", err);
      }
    };
    setupDB();

    // Listen for auth events to upsert profile
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const user = session.user;
        try {
          const { error } = await supabase.from('profiles').upsert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata.full_name || user.email?.split('@')[0] || 'User',
            avatar_url: user.user_metadata.avatar_url || '',
            preferred_voice: 'meera',
            preferred_domain: 'backend'
          });
          if (error) {
            console.warn('Profile upsert returned error:', error.message);
          } else {
            console.log('Profile upsert succeeded for user:', user.id);
          }
        } catch (err) {
          console.warn('Profiles upsert failed (offline/mock fallback):', err);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}