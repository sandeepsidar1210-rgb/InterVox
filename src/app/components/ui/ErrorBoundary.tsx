import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw, Copy, Check } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, copied: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleCopyDetails = async () => {
    if (!this.state.error) return;
    try {
      await navigator.clipboard.writeText(this.state.error.stack || this.state.error.message);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (err) {
      console.error("Failed to copy error details:", err);
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0e0e11] text-[#f0f0f5] flex items-center justify-center p-6">
          <div className="glass-panel p-8 max-w-md w-full border border-glass-border bg-surface-2 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
              <AlertTriangle size={32} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              Something went wrong
            </h2>
            <p className="text-xs text-text-secondary mb-6 leading-relaxed">
              An unexpected error has occurred in the application. Please reload or copy details to share with support.
            </p>
            {this.state.error && (
              <div className="w-full text-left p-3 rounded-lg bg-black/40 border border-glass-border mb-6 overflow-x-auto text-[10px] font-mono text-red-300 max-h-36">
                {this.state.error.message}
              </div>
            )}
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-white transition-colors text-xs font-bold uppercase tracking-wider"
              >
                <RotateCcw size={14} />
                Reload Page
              </button>
              <button
                onClick={this.handleCopyDetails}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-glass-border bg-glass-bg hover:bg-white/5 text-white transition-colors text-xs font-bold uppercase tracking-wider"
              >
                {this.state.copied ? (
                  <>
                    <Check size={14} className="text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copy Details
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
