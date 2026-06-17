import { useState, useEffect, useRef } from "react";
import { supabase } from "../../utils/supabase";
import { useToast } from "../../hooks/useToast";
import { useNavigate } from "react-router";
import * as db from "../../utils/db";
import { UserCircle, Upload, Save, Mail, User, Briefcase, Award, Volume2, Trash2, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageLoader } from "../components";

export default function Profile() {
  const toast = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  
  const [formData, setFormData] = useState({
    fullName: "",
    preferredDomain: "Backend",
    preferredVoice: "meera",
    avatarUrl: ""
  });

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUserId(session.user.id);
          setEmail(session.user.email || "");
          
          const { data: profile, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();

          if (!error && profile) {
            setFormData({
              fullName: profile.full_name || "",
              preferredDomain: profile.preferred_domain || "Backend",
              preferredVoice: profile.preferred_voice || "meera",
              avatarUrl: profile.avatar_url || ""
            });
          } else {
            // Fallback: build default settings
            const defaultName = session.user.user_metadata.full_name || session.user.email?.split("@")[0] || "User";
            setFormData({
              fullName: defaultName,
              preferredDomain: "Backend",
              preferredVoice: "meera",
              avatarUrl: session.user.user_metadata.avatar_url || ""
            });
          }
        } else {
          toast.error("Unauthenticated. Redirecting...");
          navigate("/auth");
        }
      } catch (err) {
        console.error("Error loading profile:", err);
        toast.error("Failed to load profile settings.");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").upsert({
        id: userId,
        email: email,
        full_name: formData.fullName,
        preferred_domain: formData.preferredDomain,
        preferred_voice: formData.preferredVoice,
        avatar_url: formData.avatarUrl,
        updated_at: new Date().toISOString()
      });

      if (error) throw error;
      toast.success("Profile saved successfully!");
    } catch (err: any) {
      console.error("Error saving profile:", err);
      toast.error(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userId || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    // Validate image format & size (max 2MB)
    if (!file.type.startsWith("image/")) {
      toast.error("File must be an image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File size must be less than 2MB.");
      return;
    }

    setSaving(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}_avatar_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      const publicUrl = data.publicUrl;
      setFormData((prev) => ({ ...prev, avatarUrl: publicUrl }));
      
      // Save directly to profiles
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);

      if (updateError) throw updateError;
      
      toast.success("Profile photo uploaded!");
    } catch (err: any) {
      console.error("Avatar upload error:", err);
      toast.error(err.message || "Failed to upload image. Please check bucket policies.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteData = async () => {
    if (!userId) return;
    try {
      toast.info("Deleting all sessions and personal data...");
      
      // 1. Delete sessions from Supabase
      const { error: sessionsErr } = await supabase
        .from("sessions")
        .delete()
        .eq("user_id", userId);

      if (sessionsErr) throw sessionsErr;

      // 2. Delete profile from Supabase
      const { error: profileErr } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);

      if (profileErr) throw profileErr;

      // 3. Clean IndexedDB
      await db.clearAllData();

      toast.success("All personal records cleared successfully.");
      
      // 4. Log out and navigate
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (err: any) {
      console.error("Delete data error:", err);
      toast.error(err.message || "Failed to delete account data.");
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#0e0e11] text-[#f0f0f5] relative min-h-screen">
      {/* Background Orbs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="glass-panel border-t-0 border-x-0 rounded-none bg-surface-1/80 backdrop-blur-md px-6 lg:px-8 py-6 z-10 sticky top-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-9 h-9 rounded-xl border border-glass-border bg-glass-bg flex items-center justify-center hover:bg-white/5 text-text-secondary hover:text-white transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 800,
                  fontSize: "1.5rem",
                  color: "#FFFFFF",
                  letterSpacing: "-0.02em",
                }}
              >
                Profile Settings
              </h1>
              <p className="text-text-secondary text-xs mt-0.5">
                Customize your interviewer configurations and career focus
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="px-6 lg:px-8 py-8 max-w-3xl mx-auto flex flex-col gap-6 relative z-10">
        
        {/* Avatar Section */}
        <div className="glass-panel p-6 bg-surface-2/30 border border-glass-border rounded-2xl flex flex-col gap-4">
          <h2 className="text-base font-bold text-white font-montserrat">
            Profile Avatar
          </h2>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative">
              {formData.avatarUrl ? (
                <img
                  src={formData.avatarUrl}
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover border-4 border-glass-border shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary/10 border-4 border-glass-border flex items-center justify-center text-primary">
                  <UserCircle size={48} strokeWidth={1} />
                </div>
              )}
              {saving && (
                <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center border-4 border-transparent">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            <div className="flex flex-col items-center sm:items-start gap-2.5">
              <p className="text-xs text-text-secondary text-center sm:text-left leading-relaxed max-w-xs">
                Upload a professional picture. File formats: PNG, JPG (Max 2MB).
              </p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-glass-border bg-glass-bg hover:bg-white/5 text-text-primary transition-colors text-sm font-semibold disabled:opacity-50"
              >
                <Upload size={14} />
                Upload New Image
              </button>
            </div>
          </div>
        </div>

        {/* Configurations Form */}
        <div className="glass-panel p-6 bg-surface-2/30 border border-glass-border rounded-2xl flex flex-col gap-5">
          <h2 className="text-base font-bold text-white font-montserrat">
            Personal Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Full Name */}
            <div className="flex flex-col gap-2">
              <label htmlFor="fullName" className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                <User size={13} className="text-primary" />
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                value={formData.fullName}
                onChange={(e) => handleChange("fullName", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-glass-border bg-[#131316]/55 text-white outline-none focus:border-primary transition-all font-inter text-sm"
              />
            </div>

            {/* Email (Read-only) */}
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                <Mail size={13} className="text-primary" />
                Email Address (Account ID)
              </label>
              <input
                id="email"
                type="email"
                value={email}
                disabled
                className="w-full px-4 py-3 rounded-xl border border-glass-border bg-[#131316]/20 text-text-secondary cursor-not-allowed outline-none font-inter text-sm opacity-65"
              />
            </div>

            {/* Domain preference selection */}
            <div className="flex flex-col gap-2">
              <label htmlFor="preferredDomain" className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                <Briefcase size={13} className="text-primary" />
                Preferred Practice Domain
              </label>
              <select
                id="preferredDomain"
                value={formData.preferredDomain}
                onChange={(e) => handleChange("preferredDomain", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-glass-border bg-[#131316] text-white outline-none focus:border-primary transition-all cursor-pointer font-inter text-sm"
              >
                <option value="Backend">Backend Developer</option>
                <option value="Frontend">Frontend Developer</option>
                <option value="Full Stack">Full Stack Developer</option>
                <option value="ML">Machine Learning / AI</option>
                <option value="Data Science">Data Scientist</option>
                <option value="DevOps">DevOps & Cloud</option>
              </select>
            </div>

            {/* Voice Persona Dropdown */}
            <div className="flex flex-col gap-2">
              <label htmlFor="preferredVoice" className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                <Volume2 size={13} className="text-primary" />
                AI Interviewer Voice Accent
              </label>
              <select
                id="preferredVoice"
                value={formData.preferredVoice}
                onChange={(e) => handleChange("preferredVoice", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-glass-border bg-[#131316] text-white outline-none focus:border-primary transition-all cursor-pointer font-inter text-sm"
              >
                <option value="meera">Meera (Warm English accent)</option>
                <option value="kavya">Kavya (Professional Female English)</option>
                <option value="rohan">Rohan (Professional Male English)</option>
                <option value="deepika">Deepika (Clear Female accent)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end mt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-white transition-all text-sm font-semibold shadow-[0_4px_16px_var(--accent-glow)] disabled:opacity-50"
            >
              <Save size={15} />
              Save Configuration
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="glass-panel p-6 bg-red-950/10 border border-red-500/20 rounded-2xl flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Trash2 className="text-red-400 mt-0.5 flex-shrink-0" size={18} />
            <div>
              <h3 className="text-base font-bold text-white font-montserrat">
                Danger Zone
              </h3>
              <p className="text-xs text-red-200/60 leading-relaxed mt-0.5">
                Clearing your personal records deletes all past sessions, logs, and scoring metrics from Supabase and local IndexedDB. This is irreversible.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            {!showConfirmDelete ? (
              <button
                onClick={() => setShowConfirmDelete(true)}
                className="px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-xs font-bold uppercase tracking-wider"
              >
                Clear All Data
              </button>
            ) : (
              <div className="flex items-center gap-3 animate-fade-in">
                <span className="text-xs text-red-300 font-bold font-inter">
                  Are you absolutely sure?
                </span>
                <button
                  onClick={handleDeleteData}
                  className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-colors shadow-lg"
                >
                  Yes, Delete Everything
                </button>
                <button
                  onClick={() => setShowConfirmDelete(false)}
                  className="px-3.5 py-2 bg-[#131316] hover:bg-white/5 border border-glass-border text-text-secondary rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
