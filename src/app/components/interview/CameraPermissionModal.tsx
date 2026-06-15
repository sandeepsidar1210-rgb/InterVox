import React, { useState } from "react";
import { ShieldCheck, Check, AlertCircle } from "lucide-react";
import { supabase } from "../../../utils/supabase";

interface CameraPermissionModalProps {
  open: boolean;
  onClose: () => void;
  onGrant: (stream: MediaStream) => void;
}

export default function CameraPermissionModal({
  open,
  onClose,
  onGrant,
}: CameraPermissionModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleRequestPermission = async () => {
    setError(null);
    setLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: "user"
        },
        audio: false,
      });

      // Save preference to profiles table in Supabase
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await supabase
            .from("profiles")
            .update({ camera_enabled_preference: true })
            .eq("id", session.user.id);
        }
      } catch (dbErr) {
        console.warn("Could not save camera preference to Supabase profile:", dbErr);
      }

      onGrant(stream);
      onClose();
    } catch (err: any) {
      console.warn("Camera request error:", err);
      setError("Camera access was denied. Check browser settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#0F172A]/70 backdrop-blur-md" onClick={onClose} />

      {/* Card */}
      <div className="relative w-full max-w-md bg-[#18181c] border border-glass-border rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center">
        {/* Shield Icon */}
        <div className="w-16 h-16 rounded-2xl bg-[#00CEC9]/15 flex items-center justify-center mb-5 border border-[#00CEC9]/20">
          <ShieldCheck size={36} className="text-[#00CEC9]" strokeWidth={2} />
        </div>

        {/* Title */}
        <h3
          className="text-white font-bold text-lg mb-2"
          style={{ fontFamily: "'Montserrat', sans-serif" }}
        >
          Your privacy is protected
        </h3>
        <p className="text-xs text-text-secondary mb-6 leading-relaxed max-w-xs">
          Enable body language and presence metrics. Everything runs locally inside your browser.
        </p>

        {/* Bullet Points */}
        <div className="flex flex-col gap-3 text-left w-full mb-6">
          <div className="flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Check size={12} className="text-emerald-400" strokeWidth={3} />
            </div>
            <p className="text-xs text-[#d0d0d8] leading-relaxed">
              Video is analysed entirely on your device using MediaPipe
            </p>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Check size={12} className="text-emerald-400" strokeWidth={3} />
            </div>
            <p className="text-xs text-[#d0d0d8] leading-relaxed">
              No video frames are sent to any server
            </p>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Check size={12} className="text-emerald-400" strokeWidth={3} />
            </div>
            <p className="text-xs text-[#d0d0d8] leading-relaxed">
              Only anonymised metrics (scores, percentages) are saved
            </p>
          </div>
        </div>

        {/* Inline Error */}
        {error && (
          <div className="w-full flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-left text-xs mb-5 animate-pulse">
            <AlertCircle size={14} className="flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={handleRequestPermission}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#00CEC9] hover:bg-[#02b3b0] disabled:bg-slate-600 text-[#0F172A] text-sm font-bold transition-all shadow-[0_4px_12px_rgba(0,206,201,0.25)]"
          >
            {loading ? "Initializing Camera..." : "Enable Camera"}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full py-2.5 rounded-xl border border-glass-border hover:bg-white/5 text-text-secondary hover:text-white text-xs font-semibold transition-colors"
          >
            Continue without camera
          </button>
        </div>
      </div>
    </div>
  );
}
