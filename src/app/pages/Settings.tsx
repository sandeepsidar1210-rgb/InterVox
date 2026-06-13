import { useState, useEffect } from "react";
import { Settings as SettingsIcon, Moon, Sun, Contrast, Mic, Mail, TrendingUp, Megaphone, AlertTriangle, Trash2, Play, VolumeX } from "lucide-react";
import { useSarvamTTS } from "../../hooks/useSarvamTTS";
import { getSetting, saveSetting } from "../../utils/db";

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? "bg-primary" : "bg-white/10"
      }`}
      role="switch"
      aria-checked={enabled}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

const sarvamVoices = [
  { id: "kavya", name: "Kavya", description: "Clear, professional female voice (Indian accent)" },
  { id: "amit", name: "Amit", description: "Warm, engaging male voice (Indian accent)" },
  { id: "meera", name: "Meera", description: "Supportive, clear female voice (Indian accent)" },
  { id: "arjun", name: "Arjun", description: "Professional, clean male voice (Indian accent)" },
  { id: "ananya", name: "Ananya", description: "Friendly, casual female voice (Indian accent)" },
];

export default function Settings() {
  const { speak, stop, isSpeaking } = useSarvamTTS();

  const [preferences, setPreferences] = useState({
    darkMode: true, // Default to true for dark mode app theme
    highContrast: false,
    voiceInput: true,
  });

  const [notifications, setNotifications] = useState({
    emailSummaries: true,
    weeklyReports: true,
    productUpdates: false,
  });

  const [selectedVoice, setSelectedVoice] = useState("kavya");
  
  useEffect(() => {
    const loadVoiceSetting = async () => {
      try {
        const voice = await getSetting("intervox_voice_preference");
        if (voice) {
          setSelectedVoice(voice);
        }
      } catch (err) {
        console.error("Failed to load voice setting:", err);
      }
    };
    loadVoiceSetting();
  }, []);
  
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  const handlePreferenceChange = (key: string, value: boolean) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  const handleNotificationChange = (key: string, value: boolean) => {
    setNotifications((prev) => ({ ...prev, [key]: value }));
  };

  const handleVoiceChange = async (voiceId: string) => {
    setSelectedVoice(voiceId);
    try {
      await saveSetting("intervox_voice_preference", voiceId);
    } catch (err) {
      console.error("Failed to save voice setting:", err);
    }
  };

  const handlePreviewVoice = async (voiceId: string) => {
    if (previewingVoiceId === voiceId && isSpeaking) {
      stop();
      setPreviewingVoiceId(null);
      return;
    }
    
    setPreviewingVoiceId(voiceId);
    try {
      await speak("Hello, I'll be your interviewer today.", { speaker: voiceId });
    } catch (err) {
      console.error("Preview failed:", err);
    } finally {
      setPreviewingVoiceId(null);
    }
  };

  const handleDeleteAccount = () => {
    if (confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      alert("Account deletion initiated. You will receive a confirmation email.");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
      {/* Header */}
      <header className="glass-panel border-t-0 border-x-0 rounded-none bg-surface-1/80 backdrop-blur-md px-6 lg:px-8 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <SettingsIcon size={18} className="text-primary" strokeWidth={2} />
            </div>
            <h1
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 800,
                fontSize: "1.5rem",
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              Account Settings
            </h1>
          </div>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "0.9rem",
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            Manage your app preferences and account settings
          </p>
        </div>
      </header>

      {/* Main Content */}
      <div className="px-6 lg:px-8 py-8 max-w-4xl mx-auto flex flex-col gap-6">
        {/* Preferences Section */}
        <div className="glass-panel p-6">
          <h2
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: "1.1rem",
              color: "var(--text-primary)",
              marginBottom: "20px",
            }}
          >
            App Preferences
          </h2>

          <div className="flex flex-col gap-5">
            {/* Dark Mode */}
            <div className="flex items-center justify-between py-3 border-b border-glass-border last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  {preferences.darkMode ? (
                    <Moon size={16} className="text-text-secondary" strokeWidth={2} />
                  ) : (
                    <Sun size={16} className="text-text-secondary" strokeWidth={2} />
                  )}
                </div>
                <div>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      color: "var(--text-primary)",
                    }}
                  >
                    Dark Mode
                  </p>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Switch to dark theme for better visibility at night
                  </p>
                </div>
              </div>
              <ToggleSwitch
                enabled={preferences.darkMode}
                onChange={(value) => handlePreferenceChange("darkMode", value)}
              />
            </div>

            {/* High Contrast Mode */}
            <div className="flex items-center justify-between py-3 border-b border-glass-border last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Contrast size={16} className="text-text-secondary" strokeWidth={2} />
                </div>
                <div>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      color: "var(--text-primary)",
                    }}
                  >
                    High Contrast Mode
                  </p>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Increase text contrast for better readability
                  </p>
                </div>
              </div>
              <ToggleSwitch
                enabled={preferences.highContrast}
                onChange={(value) => handlePreferenceChange("highContrast", value)}
              />
            </div>

            {/* Enable Voice Input by Default */}
            <div className="flex items-center justify-between py-3 border-b border-glass-border last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Mic size={16} className="text-text-secondary" strokeWidth={2} />
                </div>
                <div>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      color: "var(--text-primary)",
                    }}
                  >
                    Enable Voice Input by Default
                  </p>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Automatically activate microphone during interviews
                  </p>
                </div>
              </div>
              <ToggleSwitch
                enabled={preferences.voiceInput}
                onChange={(value) => handlePreferenceChange("voiceInput", value)}
              />
            </div>
          </div>
        </div>

        {/* Voice Selector Section */}
        <div className="glass-panel p-6">
          <h2
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: "1.1rem",
              color: "var(--text-primary)",
              marginBottom: "12px",
            }}
          >
            Voice Settings (Sarvam AI)
          </h2>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "0.875rem",
              color: "var(--text-secondary)",
              marginBottom: "20px",
              lineHeight: 1.5
            }}
          >
            Select your preferred AI interviewer voice persona. Play a quick preview to hear their voice synthesis.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sarvamVoices.map((voice) => {
              const isSelected = selectedVoice === voice.id;
              const isCurrentlyPreviewing = previewingVoiceId === voice.id && isSpeaking;
              return (
                <div
                  key={voice.id}
                  onClick={() => handleVoiceChange(voice.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-4 ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-glass-border bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-1 ${
                        isSelected ? "border-primary" : "border-glass-border"
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <div>
                      <p
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontWeight: 600,
                          fontSize: "0.875rem",
                          color: "var(--text-primary)",
                        }}
                      >
                        {voice.name}
                      </p>
                      <p
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                          lineHeight: 1.4,
                          marginTop: "2px",
                        }}
                      >
                        {voice.description}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // prevent selecting the card
                      handlePreviewVoice(voice.id);
                    }}
                    className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold w-fit transition-all border ${
                      isCurrentlyPreviewing
                        ? "bg-red-500/10 border-red-500/20 text-red-400"
                        : "bg-white/5 border-glass-border text-text-primary hover:bg-white/10"
                    }`}
                  >
                    {isCurrentlyPreviewing ? (
                      <>
                        <VolumeX size={12} />
                        Stop Preview
                      </>
                    ) : (
                      <>
                        <Play size={12} className="fill-current" />
                        Preview Voice
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Notifications Section */}
        <div className="glass-panel p-6">
          <h2
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: "1.1rem",
              color: "var(--text-primary)",
              marginBottom: "20px",
            }}
          >
            Notifications
          </h2>

          <div className="flex flex-col gap-5">
            {/* Email me Interview Summaries */}
            <div className="flex items-center justify-between py-3 border-b border-glass-border last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Mail size={16} className="text-text-secondary" strokeWidth={2} />
                </div>
                <div>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      color: "var(--text-primary)",
                    }}
                  >
                    Email me Interview Summaries
                  </p>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Receive detailed summaries after each interview session
                  </p>
                </div>
              </div>
              <ToggleSwitch
                enabled={notifications.emailSummaries}
                onChange={(value) => handleNotificationChange("emailSummaries", value)}
              />
            </div>

            {/* Weekly Progress Reports */}
            <div className="flex items-center justify-between py-3 border-b border-glass-border last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <TrendingUp size={16} className="text-text-secondary" strokeWidth={2} />
                </div>
                <div>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      color: "var(--text-primary)",
                    }}
                  >
                    Weekly Progress Reports
                  </p>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Get weekly insights on your interview performance
                  </p>
                </div>
              </div>
              <ToggleSwitch
                enabled={notifications.weeklyReports}
                onChange={(value) => handleNotificationChange("weeklyReports", value)}
              />
            </div>

            {/* Product Updates */}
            <div className="flex items-center justify-between py-3 border-b border-glass-border last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Megaphone size={16} className="text-text-secondary" strokeWidth={2} />
                </div>
                <div>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      color: "var(--text-primary)",
                    }}
                  >
                    Product Updates
                  </p>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Stay informed about new features and improvements
                  </p>
                </div>
              </div>
              <ToggleSwitch
                enabled={notifications.productUpdates}
                onChange={(value) => handleNotificationChange("productUpdates", value)}
              />
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div
          className="bg-red-500/5 rounded-2xl border border-red-500/20 p-6"
          style={{ boxShadow: "0 1px 12px rgba(239,68,68,0.04)" }}
        >
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={18} className="text-red-400" strokeWidth={2} />
            </div>
            <div>
              <h2
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700,
                  fontSize: "1.1rem",
                  color: "#f87171",
                  marginBottom: "4px",
                }}
              >
                Danger Zone
              </h2>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "0.875rem",
                  color: "#fca5a5",
                  lineHeight: 1.6,
                }}
              >
                Once you delete your account, there is no going back. Please be certain.
              </p>
            </div>
          </div>

          <button
            onClick={handleDeleteAccount}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-red-500 text-red-400 hover:bg-red-500 hover:text-white transition-all font-semibold"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "0.875rem",
            }}
          >
            <Trash2 size={16} strokeWidth={2} />
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}
