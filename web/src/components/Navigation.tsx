import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  PlayCircle,
  CheckSquare,
  Shield,
  UserCheck,
  AlertTriangle,
  History,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { UserSessionDTO } from '../types';

interface NavigationProps {
  currentUser: UserSessionDTO;
  onSwitchUser: (user: UserSessionDTO) => void;
  onLogout?: () => void;
  pendingGatesCount: number;
}

const AVAILABLE_USERS: UserSessionDTO[] = [
  {
    user_id: 'sec_reviewer_1',
    roles: ['control_reviewer'],
    email: 'ksushanth9030@gmail.com',
  },
  {
    user_id: 'sec_owner_1',
    roles: ['db_security_owner', 'control_owner'],
    email: 'ksushanth9030@gmail.com',
  },
  {
    user_id: 'release_owner_1',
    roles: ['release_owner'],
    email: 'ksushanth9030@gmail.com',
  },
];

export const Navigation: React.FC<NavigationProps> = ({
  currentUser,
  onSwitchUser,
  onLogout,
  pendingGatesCount,
}) => {
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);

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
    { to: '/findings', label: 'Security Findings', icon: AlertTriangle },
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

      {/* Operator Profile and Sign Out / Role Switcher */}
      <div className="pt-4 border-t border-[#183e2e] space-y-3">
        <div className="flex items-center gap-3 px-1">
          <div className="w-9 h-9 rounded-full bg-[#245e45] text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white truncate" title={currentUser.email}>
              {username}
            </div>
            <div className="text-[10px] uppercase font-semibold tracking-wider text-[#8ea79b] truncate">
              {currentUser.roles[0]?.replace(/_/g, ' ') || 'CONTROL REVIEWER'}
            </div>
          </div>
        </div>

        {/* Role Switcher Popover for HITL Maker-Checker Testing */}
        {showRoleSwitcher && (
          <div className="p-2.5 rounded-lg bg-[#133526] border border-[#204a37] space-y-1.5 text-xs animate-in fade-in duration-150">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#8ea79b] block mb-1">
              Simulate Role
            </span>
            {AVAILABLE_USERS.map((u) => (
              <button
                key={u.user_id}
                type="button"
                onClick={() => {
                  const targetEmail =
                    currentUser.email && !currentUser.email.includes('@bank.internal')
                      ? currentUser.email
                      : u.email;
                  onSwitchUser({ ...u, email: targetEmail });
                  setShowRoleSwitcher(false);
                }}
                className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  currentUser.user_id === u.user_id
                    ? 'bg-[#1e4e3a] text-white font-semibold'
                    : 'text-[#a0bfb0] hover:text-white hover:bg-[#183e2e]'
                }`}
              >
                {u.user_id} ({u.roles[0]?.replace(/_/g, ' ')})
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShowRoleSwitcher(!showRoleSwitcher)}
            className="py-1.5 px-2 rounded-lg bg-[#163c2c] hover:bg-[#1e4e3a] text-slate-200 text-[11px] font-medium transition-all text-center flex items-center justify-center gap-1 cursor-pointer border border-[#204a37]"
            title="Switch Maker-Checker Role for Testing"
          >
            <UserCheck className="w-3 h-3 text-emerald-400" />
            <span>Role</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showRoleSwitcher ? 'rotate-180' : ''}`} />
          </button>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="py-1.5 px-2 rounded-lg bg-white/10 hover:bg-rose-950/60 hover:text-rose-300 text-slate-200 text-[11px] font-medium transition-all text-center flex items-center justify-center gap-1 cursor-pointer border border-white/10 hover:border-rose-800"
              title="Sign Out"
            >
              <LogOut className="w-3 h-3" />
              <span>Sign out</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

