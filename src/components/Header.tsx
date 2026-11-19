import React from 'react';
import {
  ShieldCheck,
  RotateCcw,
  FlaskConical,
  MessageSquare,
  FileText,
  Database,
  CheckCircle2,
  Calendar,
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'chat' | 'tests' | 'audit' | 'database' | 'mistakes';
  setActiveTab: (tab: 'chat' | 'tests' | 'audit' | 'database' | 'mistakes') => void;
  onResetDb: () => void;
  isResetting: boolean;
  passCount: number;
  totalScenarios: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onResetDb,
  isResetting,
  passCount,
  totalScenarios,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Logo & Info */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-lg shadow-inner">
              H9
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  H9loop Support Resolver
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800">
                  <ShieldCheck className="w-3 h-3 mr-1" /> POPIA Compliant
                </span>
              </div>
              <p className="text-xs text-slate-400">
                South Africa Support Engine • South African Rand (ZAR)
              </p>
            </div>
          </div>

          {/* Right Meta Controls */}
          <div className="flex items-center space-x-3">
            <div className="hidden md:flex items-center text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1.5 rounded-md border border-slate-700/80">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
              <span>Reference Date: <strong className="text-slate-200">2026-10-05</strong></span>
            </div>

            <div className="flex items-center text-xs bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1.5 rounded-md text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              <span>Tests: <strong>{passCount}/{totalScenarios}</strong> Passing</span>
            </div>

            <button
              onClick={onResetDb}
              disabled={isResetting}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50 cursor-pointer shadow-sm"
              title="Reset data_work from data_original"
            >
              <RotateCcw className={`w-3.5 h-3.5 mr-1.5 ${isResetting ? 'animate-spin text-emerald-400' : 'text-slate-400'}`} />
              {isResetting ? 'Resetting DB...' : 'Reset Database'}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex space-x-1 sm:space-x-2 mt-3 pt-2 border-t border-slate-800/60 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1.5 rounded-md font-medium transition flex items-center cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            Support Chat & Real-Time Diagnostics
          </button>

          <button
            onClick={() => setActiveTab('tests')}
            className={`px-3 py-1.5 rounded-md font-medium transition flex items-center cursor-pointer ${
              activeTab === 'tests'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
            Test Runner (14 Scenarios)
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-md font-medium transition flex items-center cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Audit Trail (/audit_trail/)
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`px-3 py-1.5 rounded-md font-medium transition flex items-center cursor-pointer ${
              activeTab === 'database'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Database className="w-3.5 h-3.5 mr-1.5" />
            Database & Backups
          </button>

          <button
            onClick={() => setActiveTab('mistakes')}
            className={`px-3 py-1.5 rounded-md font-medium transition flex items-center cursor-pointer ${
              activeTab === 'mistakes'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
            Seven-Mistakes Mitigation (Section B & C)
          </button>
        </nav>
      </div>
    </header>
  );
};
