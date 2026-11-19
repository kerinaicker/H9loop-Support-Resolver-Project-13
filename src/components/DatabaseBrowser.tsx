import React, { useState, useEffect } from 'react';
import {
  fetchTableRows,
  fetchBackups,
  createManualBackup,
  resetDatabase,
} from '../services/api.ts';
import {
  Database,
  Archive,
  RotateCcw,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Table as TableIcon,
} from 'lucide-react';

export const DatabaseBrowser: React.FC = () => {
  const [currentTable, setCurrentTable] = useState<string>('orders');
  const [tableData, setTableData] = useState<{ count: number; rows: any[] }>({ count: 0, rows: [] });
  const [backups, setBackups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'tables' | 'backups'>('tables');

  const tablesList = ['orders', 'customers', 'products', 'payments', 'refunds', 'support_cases', 'policies'];

  const loadCurrentTable = async (tName: string) => {
    setIsLoading(true);
    try {
      const data = await fetchTableRows(tName);
      setTableData({ count: data.count, rows: data.rows });
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBackups = async () => {
    try {
      const b = await fetchBackups();
      setBackups(b);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadCurrentTable(currentTable);
    loadBackups();
  }, [currentTable]);

  const handleCreateBackup = async () => {
    try {
      await createManualBackup();
      await loadBackups();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredRows = tableData.rows.filter((r) => {
    if (!searchQuery) return true;
    return JSON.stringify(r).toLowerCase().includes(searchQuery.toLowerCase());
  });

  const columns = tableData.rows.length > 0 ? Object.keys(tableData.rows[0]) : [];

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center">
              <Database className="w-4 h-4 mr-2 text-cyan-400" />
              Live Working Database Browser (/data_work/)
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700 font-mono">
              Strictly isolated from data_original/
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Live state of all seven CSV files in <code className="text-emerald-400 font-mono">data_work/</code>. A timestamped backup snapshot is created in <code className="text-cyan-400 font-mono">/backups/</code> before every write operation.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => {
              loadCurrentTable(currentTable);
              loadBackups();
            }}
            disabled={isLoading}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleCreateBackup}
            className="px-3.5 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-semibold flex items-center transition shadow-md cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Snapshot Backup Now
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-2 text-xs">
        <button
          onClick={() => setActiveSubTab('tables')}
          className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center ${
            activeSubTab === 'tables'
              ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <TableIcon className="w-3.5 h-3.5 mr-1.5" />
          Working Tables ({tablesList.length})
        </button>

        <button
          onClick={() => setActiveSubTab('backups')}
          className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center ${
            activeSubTab === 'backups'
              ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Archive className="w-3.5 h-3.5 mr-1.5" />
          Timestamped Backups ({backups.length})
        </button>
      </div>

      {activeSubTab === 'tables' && (
        <div className="space-y-3">
          {/* Table Selector Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {tablesList.map((t) => (
              <button
                key={t}
                onClick={() => setCurrentTable(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition cursor-pointer ${
                  currentTable === t
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                {t}.csv {currentTable === t && `(${tableData.count})`}
              </button>
            ))}
          </div>

          {/* Search Table */}
          <div className="relative w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Filter rows in ${currentTable}...`}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          {/* Table Data Viewer */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
            <div className="overflow-x-auto max-h-[550px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-mono tracking-wider sticky top-0 z-10 border-b border-slate-800">
                  <tr>
                    {columns.map((col) => (
                      <th key={col} className="py-2.5 px-3 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono text-[11px]">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length || 1} className="py-8 text-center text-slate-500 text-xs font-sans">
                        {isLoading ? 'Loading table data...' : 'No records found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-850/60 transition">
                        {columns.map((col) => {
                          const val = row[col];
                          const isRefunded = col === 'refund_status' && val === 'refunded';
                          const isFraud = col === 'fraud_flag' && val === 1;
                          const isLocked = col === 'account_status' && (val === 'locked' || val === 'suspended');

                          return (
                            <td
                              key={col}
                              className={`py-2.5 px-3 whitespace-nowrap ${
                                isRefunded
                                  ? 'text-emerald-400 font-bold'
                                  : isFraud
                                  ? 'text-red-400 font-bold'
                                  : isLocked
                                  ? 'text-amber-400 font-bold'
                                  : 'text-slate-300'
                              }`}
                            >
                              {val === null || val === undefined ? '—' : String(val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'backups' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Timestamped Backup Snapshots in /h9loop_support/backups/
            </span>
            <span className="text-xs text-slate-400 font-mono">{backups.length} Snapshots</span>
          </div>

          {backups.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No backups created yet. Any write to <code className="text-emerald-400">data_work/</code> automatically creates a snapshot first.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {backups.map((b) => (
                <div key={b.id} className="py-2.5 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center space-x-2">
                    <Archive className="w-4 h-4 text-cyan-400" />
                    <span className="text-slate-200 font-bold">{b.id}</span>
                    <span className="text-slate-500 text-[10px]">({b.filesCount} files)</span>
                  </div>
                  <span className="text-slate-400 text-[11px]">{b.timestamp.replace('T', ' ').substring(0, 19)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
