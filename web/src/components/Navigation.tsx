import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BookOpen, ShieldCheck, PlayCircle, UserCheck, Shield } from 'lucide-react';
import { UserSessionDTO } from '../types';

interface NavigationProps {
  currentUser: UserSessionDTO;
  onSwitchUser: (user: UserSessionDTO) => void;
  pendingGatesCount: number;
}

const AVAILABLE_USERS: UserSessionDTO[] = [
  {
    user_id: 'sec_reviewer_1',
    roles: ['control_reviewer'],
    email: 'reviewer@bank.internal',
  },
  {
    user_id: 'sec_owner_1',
    roles: ['db_security_owner', 'control_owner'],
    email: 'owner@bank.internal',
  },
  {
    user_id: 'release_owner_1',
    roles: ['release_owner'],
    email: 'release@bank.internal',
  },
];

export const Navigation: React.FC<NavigationProps> = ({ currentUser, onSwitchUser, pendingGatesCount }) => {
  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/controls', label: 'Control Library', icon: BookOpen },
    { to: '/approvals', label: 'Approvals', icon: ShieldCheck, badge: pendingGatesCount > 0 ? pendingGatesCount : undefined },
    { to: '/runs', label: 'Runs & Workflows', icon: PlayCircle },
    { to: '/findings', label: 'Findings', icon: Shield },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/90 flex flex-col justify-between p-4 shrink-0 min-h-screen shadow-xs">
      <div>
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-2 py-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 tracking-tight">Controls Platform</h1>
            <span className="text-[10px] text-blue-600 font-mono font-semibold tracking-wider">v2.0 · AGENTIC</span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200/80 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`
                }
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* User Session Switcher (Live HITL Testing) */}
      <div className="pt-4 border-t border-slate-200">
        <div className="px-1 mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Operator</span>
          <UserCheck className="w-3.5 h-3.5 text-blue-600" />
        </div>
        <select
          value={currentUser.user_id}
          onChange={(e) => {
            const selected = AVAILABLE_USERS.find((u) => u.user_id === e.target.value);
            if (selected) onSwitchUser(selected);
          }}
          className="w-full text-xs p-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
        >
          {AVAILABLE_USERS.map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.user_id} ({u.roles[0]})
            </option>
          ))}
        </select>
        <div className="mt-2 px-1 text-[11px] text-slate-500 font-mono truncate">
          Roles: {currentUser.roles.join(', ')}
        </div>
      </div>
    </aside>
  );
};
