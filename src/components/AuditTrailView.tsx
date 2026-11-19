import React, { useState } from 'react';
import { AuditLogEntry } from '../types/h9loop.ts';
import {
  FileText,
  Download,
  RotateCcw,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
} from 'lucide-react';

interface AuditTrailViewProps {
  logs: AuditLogEntry[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({
  logs,
  isLoading,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  const filteredLogs = logs.filter((log) => {
    const matchesFilter = filterType === 'ALL' || log.event_type === filterType;
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !term ||
      log.log_id.toLowerCase().includes(term) ||
      (log.customer_id && log.customer_id.toLowerCase().includes(term)) ||
      (log.order_number && log.order_number.toLowerCase().includes(term)) ||
      JSON.stringify(log.details).toLowerCase().includes(term);

    return matchesFilter && matchesSearch;
  });

  const exportAsJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `h9loop_audit_trail_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportAsCSV = () => {
    if (logs.length === 0) return;
    const headers = ['log_id', 'timestamp', 'event_type', 'customer_id', 'masked_email', 'phone_last4', 'order_number', 'details'];
    const escape = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = logs.map((l) => [
      escape(l.log_id),
      escape(l.timestamp),
      escape(l.event_type),
      escape(l.customer_id),
      escape(l.masked_email),
      escape(l.phone_last4),
      escape(l.order_number),
      escape(l.details),
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent([headers.join(','), ...rows].join('\n'));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', csvContent);
    downloadAnchor.setAttribute('download', `h9loop_audit_trail_${Date.now()}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-4">
      {/* Banner & Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center">
              <FileText className="w-4 h-4 mr-2 text-emerald-400" />
              POPIA-Compliant Audit Trail
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
              /h9loop_support/audit_trail/
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            In compliance with South Africa's POPIA Act, all personal identifiers are masked (masked email, last 4 digits only). Financial transactions, tool calls, and decisions are permanently logged.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center transition cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            Refresh Logs
          </button>

          <button
            onClick={exportAsJSON}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export JSON
          </button>

          <button
            onClick={exportAsCSV}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center transition shadow-md cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-md flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Log ID, Customer ID, Order..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <span className="text-slate-400 text-[11px]">Event Type:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="ALL">All Events ({logs.length})</option>
            <option value="DECISION">DECISION</option>
            <option value="TOOL_CALL">TOOL_CALL</option>
            <option value="REFUND_EXECUTED">REFUND_EXECUTED</option>
            <option value="ESCALATION">ESCALATION</option>
            <option value="VERIFICATION">VERIFICATION</option>
            <option value="DATA_BACKUP">DATA_BACKUP</option>
          </select>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-mono tracking-wider sticky top-0 z-10 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Log ID</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Event</th>
                <th className="py-2.5 px-3">Customer ID</th>
                <th className="py-2.5 px-3">Masked Email</th>
                <th className="py-2.5 px-3">Phone Last4</th>
                <th className="py-2.5 px-3">Order Number</th>
                <th className="py-2.5 px-3">Event Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono text-[11px]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-sans text-xs">
                    No audit records match the current filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  let badgeColor = 'bg-slate-800 text-slate-300';
                  if (log.event_type === 'REFUND_EXECUTED') badgeColor = 'bg-emerald-950 text-emerald-400 border border-emerald-800';
                  else if (log.event_type === 'DECISION') badgeColor = 'bg-purple-950 text-purple-400 border border-purple-800';
                  else if (log.event_type === 'ESCALATION') badgeColor = 'bg-amber-950 text-amber-400 border border-amber-800';
                  else if (log.event_type === 'TOOL_CALL') badgeColor = 'bg-cyan-950 text-cyan-400 border border-cyan-800';
                  else if (log.event_type === 'VERIFICATION') badgeColor = 'bg-blue-950 text-blue-400 border border-blue-800';

                  return (
                    <tr key={log.log_id} className="hover:bg-slate-850/60 transition">
                      <td className="py-2.5 px-3 text-slate-400">{log.log_id}</td>
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                        {log.timestamp.replace('T', ' ').substring(0, 19)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${badgeColor}`}>
                          {log.event_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{log.customer_id || '—'}</td>
                      <td className="py-2.5 px-3 text-emerald-400 font-semibold">{log.masked_email || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-300">{log.phone_last4 ? `***-${log.phone_last4}` : '—'}</td>
                      <td className="py-2.5 px-3 text-cyan-300">{log.order_number || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-300 max-w-xs truncate" title={JSON.stringify(log.details)}>
                        {JSON.stringify(log.details)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
