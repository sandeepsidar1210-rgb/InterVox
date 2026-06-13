import { BrowserRouter, Routes, Route, useLocation } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ProgressBar, ErrorBoundary } from "./components";
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
import SignInPage from "./pages/SignInPage";
import LogoutPage from "./pages/LogoutPage";
import { VoiceRecognitionTest } from "./components/VoiceRecognitionTest";
import CompareSessionsPage from "./pages/CompareSessionsPage";

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
          <Route path="/ai-practice" element={<PageWrapper><AIPracticePage /></PageWrapper>} />
          <Route path="/communication-practice" element={<PageWrapper><CommunicationPracticePage /></PageWrapper>} />
          <Route path="/blog" element={<PageWrapper><BlogPage /></PageWrapper>} />
          <Route path="/signin" element={<PageWrapper><SignInPage /></PageWrapper>} />
          <Route path="/logout" element={<PageWrapper><LogoutPage /></PageWrapper>} />
          <Route path="/voice-test" element={<PageWrapper><VoiceRecognitionTest /></PageWrapper>} />
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<PageWrapper><DashboardHome /></PageWrapper>} />
            <Route path="practice" element={<PageWrapper><Practice /></PageWrapper>} />
            <Route path="analytics" element={<PageWrapper><Analytics /></PageWrapper>} />
            <Route path="history" element={<PageWrapper><History /></PageWrapper>} />
            <Route path="profile" element={<PageWrapper><Profile /></PageWrapper>} />
            <Route path="settings" element={<PageWrapper><Settings /></PageWrapper>} />
          </Route>
          <Route path="/interview-live" element={<PageWrapper><LiveInterview /></PageWrapper>} />
          <Route path="/interview-results" element={<PageWrapper><InterviewResults /></PageWrapper>} />
          <Route path="/compare" element={<PageWrapper><CompareSessionsPage /></PageWrapper>} />
        </Routes>
      </AnimatePresence>
    </>
  );
}

import { useEffect } from "react";
import { initDB, migrateFromLocalStorage } from "../utils/db";

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
  }, []);

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </BrowserRouter>
  );
}