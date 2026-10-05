import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../config/firebase';
import { UserSessionDTO } from '../types';

interface AuthContextType {
  currentUser: UserSessionDTO | null;
  firebaseUser: User | null;
  loading: boolean;
  error: string | null;
  setError: (err: string | null) => void;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, displayName: string, role: string) => Promise<void>;
  logout: () => Promise<void>;
  switchRole: (role: string) => void;
  isConfigured: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ROLE_STORAGE_KEY_PREFIX = 'controls_user_role_';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<UserSessionDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isFirebaseConfigured();

  // Map Firebase user and stored role into UserSessionDTO
  const buildUserSession = (user: User, customRole?: string): UserSessionDTO => {
    const savedRole = customRole || localStorage.getItem(`${ROLE_STORAGE_KEY_PREFIX}${user.uid}`) || 'control_reviewer';

    // Store UID -> Email mapping for audit trail lookups
    if (user.email) {
      localStorage.setItem(`controls_user_email_${user.uid}`, user.email);
      localStorage.setItem(`controls_user_email_${user.uid.substring(0, 16)}`, user.email);
    }

    // Determine clean username
    const rawUsername =
      user.displayName ||
      localStorage.getItem(`controls_user_username_${user.uid}`) ||
      (user.email?.toLowerCase().includes('sushanth') ? 'Sushanth' : '') ||
      (user.email ? user.email.split('@')[0].replace(/[0-9_.-]/g, '') : '') ||
      'Sushanth';

    const cleanUsername = rawUsername
      ? rawUsername.charAt(0).toUpperCase() + rawUsername.slice(1)
      : 'Sushanth';

    return {
      user_id: user.uid.substring(0, 16),
      roles: [savedRole],
      email: user.email || 'user@bank.internal',
      username: cleanUsername,
      displayName: user.displayName || cleanUsername,
    };
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        const session = buildUserSession(user);
        setCurrentUser(session);
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isConfigured]);

  const signIn = async (email: string, pass: string) => {
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const session = buildUserSession(cred.user);
      setCurrentUser(session);
    } catch (err: any) {
      const message = err.code ? formatFirebaseError(err.code) : err.message;
      setError(message);
      throw new Error(message);
    }
  };

  const signUp = async (email: string, pass: string, displayName: string, role: string) => {
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (displayName) {
        await updateProfile(cred.user, { displayName });
        localStorage.setItem(`controls_user_username_${cred.user.uid}`, displayName);
      }
      localStorage.setItem(`${ROLE_STORAGE_KEY_PREFIX}${cred.user.uid}`, role);
      const session = buildUserSession(cred.user, role);
      setCurrentUser(session);
    } catch (err: any) {
      const message = err.code ? formatFirebaseError(err.code) : err.message;
      setError(message);
      throw new Error(message);
    }
  };

  const logout = async () => {
    setError(null);
    try {
      if (firebaseUser) {
        await signOut(auth);
      }
      setFirebaseUser(null);
      setCurrentUser(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const switchRole = (newRole: string) => {
    if (currentUser) {
      const updated: UserSessionDTO = {
        ...currentUser,
        roles: [newRole],
      };
      setCurrentUser(updated);
      if (firebaseUser) {
        localStorage.setItem(`${ROLE_STORAGE_KEY_PREFIX}${firebaseUser.uid}`, newRole);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        firebaseUser,
        loading,
        error,
        setError,
        signIn,
        signUp,
        logout,
        switchRole,
        isConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

function formatFirebaseError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'The email address format is invalid.';
    case 'auth/user-disabled':
      return 'This user account has been disabled.';
    case 'auth/user-not-found':
      return 'No account registered with this email.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect password or invalid credentials.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in Firebase Console.';
    default:
      return code.replace('auth/', '').replace(/-/g, ' ');
  }
}
