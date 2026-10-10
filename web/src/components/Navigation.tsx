import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  PlayCircle,
  CheckSquare,
  Shield,
  History,
  LogOut,
} from 'lucide-react';
import { UserSessionDTO } from '../types';
import { getPrimaryRole } from '../utils/rbac';

interface NavigationProps {
  currentUser: UserSessionDTO;
  onSwitchUser?: (user: UserSessionDTO) => void;
  onLogout?: () => void;
  pendingGatesCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentUser,
  onLogout,
  pendingGatesCount,
}) => {

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/policies', label: 'Policies', icon: FileText },
    { to: '/controls', label: 'Controls', icon: Shield },
    { to: '/runs', label: 'Control Runs', icon: PlayCircle },
    {
      to: '/approvals',
      label: 'Approvals',
      icon: CheckSquare,
      badge: pendingGatesCount > 0 ? pendingGatesCount : undefined,
    },
    { to: '/audit', label: 'Audit Trail', icon: History },
  ];

  const rawUsername =
    currentUser.username ||
    currentUser.displayName ||
    localStorage.getItem(`controls_user_username_${currentUser.user_id}`) ||
    localStorage.getItem('controls_username') ||
    (currentUser.email?.toLowerCase().includes('sushanth') ? 'Sushanth' : '') ||
    (currentUser.email ? currentUser.email.split('@')[0].replace(/[0-9_.-]/g, '') : '') ||
    'Sushanth';

  const username = rawUsername
    ? rawUsername.charAt(0).toUpperCase() + rawUsername.slice(1)
    : 'Sushanth';

  const userInitial = (username[0] || 'S').toUpperCase();

  return (
    <aside className="w-64 bg-[#0d281e] border-r border-[#16382b] flex flex-col justify-between p-4 shrink-0 h-screen sticky top-0 text-slate-100 overflow-y-auto">
      <div>
        {/* Brand Header */}
        <div className="px-3 pt-3 pb-5 mb-3 border-b border-[#183e2e]">
          <h1 className="text-base font-bold text-white tracking-tight">AI for Controls</h1>
          <p className="text-xs text-[#8ea79b] mt-0.5">Control Testing Platform</p>
        </div>

        {/* Navigation Menu */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs transition-all ${
                    isActive
                      ? 'bg-[#183e2e] text-white font-semibold shadow-xs'
                      : 'text-[#8ea79b] hover:text-white hover:bg-[#133526] font-medium'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Operator Profile and Sign Out (Fixed Role) */}
      <div className="pt-4 border-t border-[#183e2e] space-y-3">
        {(() => {
          const role = getPrimaryRole(currentUser);
          const roleConfig = {
            approver: { label: 'APPROVER', bg: 'bg-purple-900/60 text-purple-200 border-purple-700/60' },
            executor: { label: 'EXECUTOR', bg: 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60' },
            auditor: { label: 'AUDITOR (READ-ONLY)', bg: 'bg-amber-900/60 text-amber-200 border-amber-700/60' },
          }[role];

          return (
            <div className="space-y-2 px-1">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#245e45] text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                  {userInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white truncate" title={currentUser.email}>
                    {username}
                  </div>
                  <div className="text-[11px] text-[#8ea79b] truncate font-mono" title={currentUser.email}>
                    {currentUser.email}
                  </div>
                </div>
              </div>

              {/* Single Role Badge */}
              <div className="pt-1">
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${roleConfig.bg}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                  {roleConfig.label}
                </span>
              </div>
            </div>
          );
        })()}

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-rose-950/60 hover:text-rose-200 text-slate-300 text-xs font-medium transition-all text-center flex items-center justify-center gap-2 cursor-pointer border border-white/10 hover:border-rose-800"
            title="Sign Out of Session"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        )}
      </div>
    </aside>
  );
};

