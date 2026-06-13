import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Mail, Lock, User, Eye, EyeOff, Sparkles, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../utils/supabase';
import { Logo } from '../components/Logo';
import GridBackground from '../components/ui/GridBackground';

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);
  
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (activeTab === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });
        
        if (signUpError) throw signUpError;
        
        setSignupSuccess(true);
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (signInError) throw signInError;
        
        navigate('/dashboard');
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      const { error: oAuthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      });
      if (oAuthError) throw oAuthError;
    } catch (err: any) {
      console.error('Google OAuth error:', err);
      setError(err.message || 'Failed to start Google authentication.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e11] text-[#f0f0f5] flex items-center justify-center p-6 relative overflow-hidden">
      <GridBackground />
      
      {/* Decorative gradient glowing orb */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[400px] relative z-10"
      >
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Link to="/">
            <Logo className="h-12" />
          </Link>
        </div>

        {/* Glass Card */}
        <div className="glass-panel p-8 bg-surface-2/40 border border-glass-border shadow-2xl relative overflow-hidden">
          
          {signupSuccess ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-6 flex flex-col items-center gap-4"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <CheckCircle size={36} />
              </div>
              <h2 className="text-xl font-bold text-white font-montserrat">
                Confirm your Email
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed">
                We've sent a verification link to <span className="text-white font-semibold">{email}</span>. Please check your inbox and click the link to confirm your account.
              </p>
              <button
                onClick={() => {
                  setSignupSuccess(false);
                  setActiveTab('signin');
                  setPassword('');
                }}
                className="mt-4 px-6 py-2.5 rounded-xl border border-glass-border bg-glass-bg hover:bg-white/5 text-white transition-colors text-xs font-bold uppercase tracking-wider"
              >
                Back to Sign In
              </button>
            </motion.div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex bg-black/40 border border-glass-border p-1 rounded-xl mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('signin');
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    activeTab === 'signin'
                      ? 'bg-primary text-white shadow-md'
                      : 'text-text-secondary hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('signup');
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    activeTab === 'signup'
                      ? 'bg-primary text-white shadow-md'
                      : 'text-text-secondary hover:text-white'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <h2 className="text-xl font-extrabold text-white text-center mb-6 font-montserrat">
                {activeTab === 'signin' ? 'Welcome Back' : 'Create Account'}
              </h2>

              {error && (
                <div className="p-3 mb-5 text-xs rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-medium leading-relaxed">
                  {error}
                </div>
              )}

              <form onSubmit={handleAuth} className="space-y-4">
                {activeTab === 'signup' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                      Full Name
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
                        <User size={16} />
                      </div>
                      <input
                        type="text"
                        placeholder="John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        className="w-full pl-10 pr-4 py-3 bg-black/30 border border-glass-border rounded-xl text-white outline-none focus:border-primary transition-colors text-sm font-semibold"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
                      <Mail size={16} />
                    </div>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-3 bg-black/30 border border-glass-border rounded-xl text-white outline-none focus:border-primary transition-colors text-sm font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
                      <Lock size={16} />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-10 pr-12 py-3 bg-black/30 border border-glass-border rounded-xl text-white outline-none focus:border-primary transition-colors text-sm font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 flex items-center justify-center gap-2 bg-primary hover:bg-primary/95 text-white py-3.5 rounded-xl transition-all shadow-lg hover:-translate-y-0.5 font-bold text-sm tracking-wide disabled:opacity-50 disabled:pointer-events-none"
                  style={{ boxShadow: '0 4px 16px var(--accent-glow)' }}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Sparkles size={16} className="fill-current" />
                      <span>{activeTab === 'signin' ? 'Sign In' : 'Sign Up'}</span>
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-6 flex items-center">
                <div className="flex-1 border-t border-glass-border/40" />
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                  Or continue with
                </span>
                <div className="flex-1 border-t border-glass-border/40" />
              </div>

              {/* Google OAuth Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-2.5 py-3 border border-glass-border bg-glass-bg hover:bg-white/5 rounded-xl transition-all font-bold text-sm text-white hover:border-white/20"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Google</span>
              </button>
            </>
          )}
        </div>

        {/* Back to Home Link */}
        <div className="text-center mt-6">
          <Link
            to="/"
            className="text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-primary transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
