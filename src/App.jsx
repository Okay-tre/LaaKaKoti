import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import {
  Check,
  Plus,
  Trash2,
  Camera,
  LogOut,
  User,
  Home,
  ShoppingCart,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Minus,
  UserCheck,
  Calendar,
  Image as ImageIcon,
  Sun
} from 'lucide-react';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const PRIMARY_ADMIN_EMAIL = 'patteri6907@gmail.com';

const ROOM_SECTIONS = [
  'Kitchen',
  'Living room',
  'Kids room',
  'Bathroom',
  'Parents room'
];

function getAuthorInitial(user) {
  if (!user) return '?';

  const name = user.displayName || user.email || '';
  return name.trim().charAt(0).toUpperCase() || '?';
}

function useFrequentSuggestions(items, currentInput, minOccurrences = 1) {
  return useMemo(() => {
    const counts = {};

    items.forEach(item => {
      if (!item.title) return;

      const cleanTitle = item.title.trim();
      counts[cleanTitle] = (counts[cleanTitle] || 0) + 1;
    });

    return Object.entries(counts)
      .filter(
        ([title, count]) =>
          count >= minOccurrences &&
          title.toLowerCase().includes(currentInput.toLowerCase())
      )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([title]) => title);
  }, [items, currentInput, minOccurrences]);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('morning');
  const [personalOwner, setPersonalOwner] = useState('Johanna');

  const [allowedUsers, setAllowedUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [shoppingItems, setShoppingItems] = useState([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setAllowedUsers([]);
    if (!user) return;

    return onSnapshot(
      collection(db, 'allowed_users'),
      snapshot => {
        setAllowedUsers(
          snapshot.docs.map(document => ({
            id: document.id,
            ...document.data()
          }))
        );
      },
      err => console.error('Allowed users error:', err)
    );
  }, [user]);

  const userEmail = user?.email || '';

  const isAdmin =
    userEmail.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();

  const isWhitelisted = useMemo(() => {
    if (!user) return false;
    if (isAdmin) return true;

    return allowedUsers.some(
      allowedUser =>
        allowedUser.email?.toLowerCase() === userEmail.toLowerCase()
    );
  }, [user, userEmail, allowedUsers, isAdmin]);

  useEffect(() => {
    setTasks([]);
    setShoppingItems([]);

    if (!user || !isWhitelisted) return;

    const unsubTasks = onSnapshot(
      collection(db, 'tasks'),
      snapshot => {
        setTasks(
          snapshot.docs.map(document => ({
            id: document.id,
            ...document.data()
          }))
        );
      },
      err => console.error('Tasks error:', err)
    );

    const unsubShopping = onSnapshot(
      collection(db, 'shopping_items'),
      snapshot => {
        setShoppingItems(
          snapshot.docs.map(document => ({
            id: document.id,
            ...document.data()
          }))
        );
      },
      err => console.error('Shopping error:', err)
    );

    return () => {
      unsubTasks();
      unsubShopping();
    };
  }, [user, isWhitelisted]);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error('Login failed', err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign out failed', err);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F4F5F8] text-[#1F2937] flex items-center justify-center font-sans">
        <div className="p-8 bg-white text-center border border-gray-200">
          <div className="animate-spin h-10 w-10 border-b-4 border-[#D946EF] mx-auto mb-4"></div>
          <p className="text-lg font-bold text-[#1F2937]">
            Loading CHAOS CONTROL...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F4F5F8] text-[#1F2937] flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white p-8 border border-gray-300 text-center space-y-6">
          <div className="bg-[#D946EF] p-4 text-white">
            <h1 className="text-3xl font-black uppercase tracking-tight">
              CHAOS CONTROL
            </h1>
            <p className="text-xs font-bold uppercase tracking-widest text-fuchsia-200">
              Household Management
            </p>
          </div>

          <p className="text-sm font-bold text-gray-700">
            Please sign in with your authorized Google Account to continue.
          </p>

          <button
            onClick={handleGoogleLogin}
            className="w-full min-h-[48px] bg-[#D946EF] hover:bg-[#C026D3] text-white font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
          >
            <User className="w-5 h-5" />
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  if (user && !isWhitelisted) {
    return (
      <div className="min-h-screen bg-[#FEF2F2] text-[#1F2937] flex items-center justify-center p-4 font-sans leading-relaxed">
        <div className="max-w-md w-full bg-white p-8 text-center border border-red-200">
          <div className="w-16 h-16 bg-[#EF4444] text-white flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-black text-[#1F2937] mb-2">
            Pending Admin Approval
          </h1>

          <p className="text-base text-[#1F2937] mb-6">
            Your account (
            <span className="font-bold text-[#EF4444]">{userEmail}</span>
            ) is not whitelisted yet.
          </p>

          <div className="p-4 bg-[#FEE2E2] text-sm text-[#1F2937] text-left mb-6 font-medium">
            Please contact the administrator (
            <strong className="text-[#EF4444]">
              {PRIMARY_ADMIN_EMAIL}
            </strong>
            ) to authorize access.
          </div>

          <button
            onClick={handleLogout}
            className="w-full min-h-[48px] bg-[#EF4444] hover:bg-[#DC2626] text-white font-black uppercase transition-all flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F5F8] text-[#1F2937] font-sans tracking-wide leading-relaxed pb-20 md:pb-6">
      <header className="bg-[#D946EF] text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-5xl mx-auto px-4 pt-3 pb-1">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-2xl font-black tracking-tighter leading-none uppercase">
                CHAOS CONTROL
              </h1>
              <p className="text-[10px] font-extrabold text-fuchsia-200 uppercase tracking-widest mt-0.5">
                Household Hub
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-black leading-tight text-white">
                    {user.displayName || userEmail.split('@')[0]}
                  </p>
                  <p className="text-[10px] font-bold text-fuchsia-200 uppercase">
                    {isAdmin ? 'Primary Admin' : 'Household Member'}
                  </p>
                </div>

                <button
                  onClick={handleLogout}
                  title="Sign Out"
                  className="min-h-[40px] px-3 bg-black/20 hover:bg-black/40 text-white font-bold flex items-center justify-center transition-all text-xs border border-white/20"
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            </div>
          </div>

          <nav className="hidden md:flex gap-1 border-t border-fuchsia-400/50 pt-2 overflow-x-auto">
            <HeaderTabButton
              active={activeTab === 'morning'}
              onClick={() => setActiveTab('morning')}
              label="Morning"
              icon={<Sun className="w-3.5 h-3.5 inline mr-1" />}
            />

            <HeaderTabButton
              active={activeTab === 'household'}
              onClick={() => setActiveTab('household')}
              label="Household To-Do"
            />

            <HeaderTabButton
              active={activeTab === 'personal'}
              onClick={() => setActiveTab('personal')}
              label="Personal To-Do"
            />

            <HeaderTabButton
              active={activeTab === 'calendar'}
              onClick={() => setActiveTab('calendar')}
              label="Calendar"
              icon={<Calendar className="w-3.5 h-3.5 inline mr-1" />}
            />

            <HeaderTabButton
              active={activeTab === 'grocery'}
              onClick={() => setActiveTab('grocery')}
              label="Grocery List"
            />

            <HeaderTabButton
              active={activeTab === 'other'}
              onClick={() => setActiveTab('other')}
              label="Other Shopping"
            />

            {isAdmin && (
              <HeaderTabButton
                active={activeTab === 'admin'}
                onClick={() => setActiveTab('admin')}
                label="Admin Panel"
              />
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4">
        {activeTab === 'morning' && (
          <MorningToDoView user={user} tasks={tasks} />
        )}

        {activeTab === 'household' && (
          <HouseholdToDoView user={user} tasks={tasks} />
        )}

        {activeTab === 'personal' && (
          <PersonalToDoView
            user={user}
            personalOwner={personalOwner}
            setPersonalOwner={setPersonalOwner}
            tasks={tasks}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarView user={user} tasks={tasks} />
        )}

        {activeTab === 'grocery' && (
          <GroceryShoppingView items={shoppingItems} />
        )}

        {activeTab === 'other' && (
          <OtherShoppingView items={shoppingItems} />
        )}

        {activeTab === 'admin' && isAdmin && (
          <AdminPanelView allowedUsers={allowedUsers} />
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-[#D946EF] text-white p-1 flex justify-around items-center md:hidden z-40 shadow-lg border-t border-fuchsia-400">
        <MobileNavButton
          active={activeTab === 'morning'}
          onClick={() => setActiveTab('morning')}
          icon={<Sun className="w-5 h-5" />}
          label="Morning"
        />

        <MobileNavButton
          active={activeTab === 'household'}
          onClick={() => setActiveTab('household')}
          icon={<Home className="w-5 h-5" />}
          label="Household"
        />

        <MobileNavButton
          active={activeTab === 'personal'}
          onClick={() => setActiveTab('personal')}
          icon={<User className="w-5 h-5" />}
          label="Personal"
        />

        <MobileNavButton
          active={activeTab === 'calendar'}
          onClick={() => setActiveTab('calendar')}
          icon={<Calendar className="w-5 h-5" />}
          label="Calendar"
        />

        <MobileNavButton
          active={activeTab === 'grocery'}
          onClick={() => setActiveTab('grocery')}
          icon={<ShoppingCart className="w-5 h-5" />}
          label="Grocery"
        />

        <MobileNavButton
          active={activeTab === 'other'}
          onClick={() => setActiveTab('other')}
          icon={<ImageIcon className="w-5 h-5" />}
          label="Other"
        />

        {isAdmin && (
          <MobileNavButton
            active={activeTab === 'admin'}
            onClick={() => setActiveTab('admin')}
            icon={<UserCheck className="w-5 h-5" />}
            label="Admin"
          />
        )}
      </div>
    </div>
  );
}

function HeaderTabButton({ active, onClick, label, icon }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 flex items-center whitespace-nowrap ${
        active
          ? 'bg-white text-[#D946EF] border-white shadow-sm'
          : 'text-white/90 hover:bg-fuchsia-600 border-transparent'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MobileNavButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-[44px] flex-1 flex flex-col items-center justify-center py-1 transition-all ${
        active
          ? 'bg-white text-[#D946EF] font-black'
          : 'text-white/80 hover:text-white'
      }`}
    >
      {icon}
      <span className="text-[9px] font-bold uppercase">{label}</span>
    </button>
  );
}

function MorningToDoView({ user, tasks }) {
  const [newTitle, setNewTitle] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [showPhotoInput, setShowPhotoInput] = useState(false);

  const morningTasks = useMemo(
    () => tasks.filter(task => task.scope === 'morning'),
    [tasks]
  );

  const activeTasks = useMemo(
    () => morningTasks.filter(task => !task.completed),
    [morningTasks]
  );

  const completedTasks = useMemo(
    () => morningTasks.filter(task => task.completed),
    [morningTasks]
  );

  const suggestions = useFrequentSuggestions(morningTasks, newTitle);

  const handleQuickAdd = async e => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await addDoc(collection(db, 'tasks'), {
        scope: 'morning',
        owner: null,
        author: getAuthorInitial(user),
        title: newTitle.trim(),
        completed: false,
        imageUrl: photoUrl.trim() || null,
        createdAt: serverTimestamp(),
        completedAt: null
      });

      setNewTitle('');
      setPhotoUrl('');
      setShowPhotoInput(false);
    } catch (err) {
      console.error('Error adding morning task:', err);
    }
  };

  const toggleTaskStatus = async task => {
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        completed: !task.completed,
        completedAt: !task.completed ? new Date().toISOString() : null
      });
    } catch (err) {
      console.error('Error toggling task:', err);
    }
  };

  const deleteTask = async taskId => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black uppercase flex items-center gap-2">
          <Sun className="w-5 h-5 text-amber-500" />
          Morning Checklist
        </h2>
      </div>

      <div className="bg-white p-3 border border-gray-200 space-y-2">
        <form onSubmit={handleQuickAdd} className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Add morning task..."
              className="flex-1 min-h-[44px] px-3 bg-gray-50 border border-gray-300 text-sm font-bold text-[#1F2937]"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPhotoInput(!showPhotoInput)}
                className={`min-h-[44px] px-3 flex items-center justify-center ${
                  photoUrl || showPhotoInput
                    ? 'bg-[#D946EF] text-white'
                    : 'bg-gray-100 text-[#1F2937]'
                }`}
              >
                <Camera className="w-5 h-5" />
              </button>

              <button
                type="submit"
                className="min-h-[44px] px-6 bg-[#D946EF] hover:bg-[#C026D3] text-white font-black uppercase text-sm"
              >
                + Add
              </button>
            </div>
          </div>

          {showPhotoInput && (
            <div className="flex gap-2 pt-1">
              <input
                type="url"
                value={photoUrl}
                onChange={e => setPhotoUrl(e.target.value)}
                placeholder="Image URL (optional)"
                className="flex-1 min-h-[40px] px-3 bg-gray-50 border border-gray-300 text-xs font-semibold"
              />
            </div>
          )}
        </form>

        <SmartPills
          suggestions={suggestions}
          onSelect={title => setNewTitle(title)}
        />
      </div>

      <div className="bg-white border border-gray-200 p-4 space-y-2">
        <h3 className="text-xs font-black text-[#1F2937] uppercase tracking-wider mb-1">
          Active Morning Routine ({activeTasks.length})
        </h3>

        {activeTasks.length === 0 ? (
          <p className="text-xs font-semibold text-gray-400 italic py-1">
            Morning routine complete!
          </p>
        ) : (
          <div className="space-y-1.5">
            {activeTasks.map(task => (
              <TaskItemRow
                key={task.id}
                task={task}
                badgeBg="bg-amber-500 text-white"
                onToggle={() => toggleTaskStatus(task)}
                onDelete={() => deleteTask(task.id)}
              />
            ))}
          </div>
        )}
      </div>

      {completedTasks.length > 0 && (
        <div className="bg-white border border-gray-200 p-4 space-y-2 opacity-75">
          <h3 className="text-[11px] font-black text-gray-500 uppercase">
            Completed ({completedTasks.length})
          </h3>

          <div className="space-y-1.5">
            {completedTasks.map(task => (
              <TaskItemRow
                key={task.id}
                task={task}
                badgeBg="bg-gray-400 text-white"
                onToggle={() => toggleTaskStatus(task)}
                onDelete={() => deleteTask(task.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SmartPills({ suggestions, onSelect }) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1">
      <span className="shrink-0 text-xs font-bold text-gray-500">
        Frequent:
      </span>

      {suggestions.map(item => (
        <button
          key={item}
          type="button"
          onClick={() => onSelect(item)}
          className="shrink-0 text-xs font-bold px-2.5 py-1 bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200 rounded-full transition-all"
        >
          + {item}
        </button>
      ))}
    </div>
  );
}

function HouseholdToDoView({ user, tasks }) {
  const [newTitle, setNewTitle] = useState('');
  const [selectedSection, setSelectedSection] = useState('Kitchen');
  const [photoUrl, setPhotoUrl] = useState('');
  const [showPhotoInput, setShowPhotoInput] = useState(false);
  const [monthsToShow, setMonthsToShow] = useState(1);
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);

  const householdTasks = useMemo(
    () => tasks.filter(task => task.scope === 'household'),
    [tasks]
  );

  const activeTasks = useMemo(
    () => householdTasks.filter(task => !task.completed),
    [householdTasks]
  );

  const suggestions = useFrequentSuggestions(householdTasks, newTitle);

  const completedTasks = useMemo(() => {
    const list = householdTasks.filter(task => task.completed);
    const cutoffDate = new Date();

    cutoffDate.setMonth(cutoffDate.getMonth() - monthsToShow);

    return list.filter(task => {
      if (!task.completedAt) return true;

      const compDate = task.completedAt.seconds
        ? new Date(task.completedAt.seconds * 1000)
        : new Date(task.completedAt);

      return compDate >= cutoffDate;
    });
  }, [householdTasks, monthsToShow]);

  const handleQuickAdd = async e => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await addDoc(collection(db, 'tasks'), {
        scope: 'household',
        owner: null,
        author: getAuthorInitial(user),
        title: newTitle.trim(),
        section: selectedSection,
        completed: false,
        imageUrl: photoUrl.trim() || null,
        createdAt: serverTimestamp(),
        completedAt: null
      });

      setNewTitle('');
      setPhotoUrl('');
      setShowPhotoInput(false);
    } catch (err) {
      console.error('Error adding household task:', err);
    }
  };

  const toggleTaskStatus = async task => {
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        completed: !task.completed,
        completedAt: !task.completed ? new Date().toISOString() : null
      });
    } catch (err) {
      console.error('Error toggling task:', err);
    }
  };

  const deleteTask = async taskId => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-3 border border-gray-200 space-y-2">
        <form onSubmit={handleQuickAdd} className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Write a quick task..."
              className="flex-1 min-h-[44px] px-3 bg-gray-50 border border-gray-300 text-sm font-bold text-[#1F2937]"
            />

            <select
              value={selectedSection}
              onChange={e => setSelectedSection(e.target.value)}
              className="min-h-[44px] px-3 bg-gray-50 border border-gray-300 font-bold text-sm text-[#1F2937]"
            >
              {ROOM_SECTIONS.map(room => (
                <option key={room} value={room}>
                  {room}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowPhotoInput(!showPhotoInput)}
              aria-label="Add photo URL"
              className={`min-h-[44px] px-3 flex items-center justify-center ${
                photoUrl || showPhotoInput
                  ? 'bg-[#D946EF] text-white'
                  : 'bg-gray-100 text-[#1F2937]'
              }`}
            >
              <Camera className="w-5 h-5" />
            </button>

            <button
              type="submit"
              className="min-h-[44px] px-6 bg-[#D946EF] hover:bg-[#C026D3] text-white font-black uppercase text-sm"
            >
              + Add Task
            </button>
          </div>

          {showPhotoInput && (
            <div className="flex gap-2 pt-1">
              <input
                type="url"
                value={photoUrl}
                onChange={e => setPhotoUrl(e.target.value)}
                placeholder="Image URL (optional)"
                className="flex-1 min-h-[40px] px-3 bg-gray-50 border border-gray-300 text-xs font-semibold"
              />
            </div>
          )}
        </form>

        <SmartPills
          suggestions={suggestions}
          onSelect={title => setNewTitle(title)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ROOM_SECTIONS.map(room => {
          const roomTasks = activeTasks.filter(
            task => task.section === room
          );

          return (
            <div
              key={room}
              className="bg-white p-4 border border-gray-200 space-y-2"
            >
              <div className="border-b border-gray-200 pb-2 flex items-center justify-between">
                <h3 className="text-sm font-black text-[#1F2937] uppercase tracking-wider">
                  {room}
                </h3>

                <span className="bg-[#D946EF] text-white text-[10px] font-black px-2 py-0.5">
                  {roomTasks.length}
                </span>
              </div>

              {roomTasks.length === 0 ? (
                <p className="text-xs text-gray-400 py-1 italic">
                  Empty list.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {roomTasks.map(task => (
                    <TaskItemRow
                      key={task.id}
                      task={task}
                      badgeBg="bg-[#D946EF] text-white"
                      onToggle={() => toggleTaskStatus(task)}
                      onDelete={() => deleteTask(task.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-gray-200">
        <button
          onClick={() => setIsCompletedOpen(!isCompletedOpen)}
          className="w-full min-h-[44px] px-4 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-emerald-600" />

            <span className="font-black text-[#1F2937] text-xs uppercase tracking-wider">
              Completed Tasks ({completedTasks.length})
            </span>
          </div>

          {isCompletedOpen ? (
            <ChevronUp className="w-5 h-5 text-[#1F2937]" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#1F2937]" />
          )}
        </button>

        {isCompletedOpen && (
          <div className="p-4 space-y-3 border-t border-gray-200">
            <p className="text-[11px] font-bold text-gray-500">
              Showing items from past{' '}
              <strong className="text-[#1F2937]">
                {monthsToShow} month{monthsToShow > 1 ? 's' : ''}
              </strong>.
            </p>

            {completedTasks.length === 0 ? (
              <p className="text-xs font-semibold text-gray-400 italic py-1">
                No completed tasks in range.
              </p>
            ) : (
              <div className="space-y-1.5">
                {completedTasks.map(task => (
                  <TaskItemRow
                    key={task.id}
                    task={task}
                    badgeBg="bg-gray-400 text-white"
                    onToggle={() => toggleTaskStatus(task)}
                    onDelete={() => deleteTask(task.id)}
                  />
                ))}
              </div>
            )}

            {monthsToShow < 12 && (
              <div className="pt-2 border-t border-gray-100 flex justify-center">
                <button
                  onClick={() =>
                    setMonthsToShow(previous =>
                      Math.min(previous + 1, 12)
                    )
                  }
                  className="min-h-[40px] px-4 bg-[#D946EF] hover:bg-[#C026D3] text-white font-extrabold uppercase text-xs flex items-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  Show 1 Month More
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonalToDoView({
  user,
  personalOwner,
  setPersonalOwner,
  tasks
}) {
  const [newTitle, setNewTitle] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [showPhotoInput, setShowPhotoInput] = useState(false);

  const personalTasks = useMemo(
    () =>
      tasks.filter(
        task =>
          task.scope === 'personal' &&
          task.owner === personalOwner
      ),
    [tasks, personalOwner]
  );

  const activeTasks = useMemo(
    () => personalTasks.filter(task => !task.completed),
    [personalTasks]
  );

  const completedTasks = useMemo(
    () => personalTasks.filter(task => task.completed),
    [personalTasks]
  );

  const handleQuickAdd = async e => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await addDoc(collection(db, 'tasks'), {
        scope: 'personal',
        owner: personalOwner,
        author: getAuthorInitial(user),
        title: newTitle.trim(),
        section: null,
        completed: false,
        imageUrl: photoUrl.trim() || null,
        createdAt: serverTimestamp(),
        completedAt: null
      });

      setNewTitle('');
      setPhotoUrl('');
      setShowPhotoInput(false);
    } catch (err) {
      console.error('Error adding personal task:', err);
    }
  };

  const toggleTaskStatus = async task => {
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        completed: !task.completed,
        completedAt: !task.completed ? new Date().toISOString() : null
      });
    } catch (err) {
      console.error('Error toggling task:', err);
    }
  };

  const deleteTask = async taskId => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 p-3 flex items-center gap-2">
        <span className="text-xs font-bold">List Owner:</span>

        {['Johanna', 'Otto'].map(owner => (
          <button
            key={owner}
            onClick={() => setPersonalOwner(owner)}
            className={`min-h-[40px] px-5 font-black text-xs uppercase ${
              personalOwner === owner
                ? 'bg-[#D946EF] text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {owner}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 p-3 space-y-2">
        <form onSubmit={handleQuickAdd} className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder={`Add personal task for ${personalOwner}...`}
              className="flex-1 min-h-[44px] px-3 bg-gray-50 border border-gray-300 text-sm font-bold text-[#1F2937]"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPhotoInput(!showPhotoInput)}
                className={`min-h-[44px] px-3 flex items-center justify-center ${
                  photoUrl || showPhotoInput
                    ? 'bg-[#D946EF] text-white'
                    : 'bg-gray-100 text-[#1F2937]'
                }`}
              >
                <Camera className="w-5 h-5" />
              </button>

              <button
                type="submit"
                className="min-h-[44px] px-6 bg-[#D946EF] hover:bg-[#C026D3] text-white font-black text-sm uppercase"
              >
                + Add
              </button>
            </div>
          </div>

          {showPhotoInput && (
            <div className="flex gap-2 pt-1">
              <input
                type="url"
                value={photoUrl}
                onChange={e => setPhotoUrl(e.target.value)}
                placeholder="Image URL (optional)"
                className="flex-1 min-h-[40px] px-3 bg-gray-50 border border-gray-300 text-xs font-semibold"
              />
            </div>
          )}
        </form>
      </div>

      <div className="bg-white border border-gray-200 p-4 space-y-2">
        <h3 className="text-xs font-black text-[#1F2937] uppercase tracking-wider mb-1">
          {personalOwner}'s Pending Tasks ({activeTasks.length})
        </h3>

        {activeTasks.length === 0 ? (
          <p className="text-xs font-semibold text-gray-400 italic py-1">
            Nothing pending.
          </p>
        ) : (
          <div className="space-y-1.5">
            {activeTasks.map(task => (
              <TaskItemRow
                key={task.id}
                task={task}
                badgeBg="bg-[#D946EF] text-white"
                onToggle={() => toggleTaskStatus(task)}
                onDelete={() => deleteTask(task.id)}
              />
            ))}
          </div>
        )}
      </div>

      {completedTasks.length > 0 && (
        <div className="bg-white border border-gray-200 p-4 space-y-2 opacity-75">
          <h3 className="text-[11px] font-black text-gray-500 uppercase">
            Completed ({completedTasks.length})
          </h3>

          <div className="space-y-1.5">
            {completedTasks.map(task => (
              <TaskItemRow
                key={task.id}
                task={task}
                badgeBg="bg-gray-400 text-white"
                onToggle={() => toggleTaskStatus(task)}
                onDelete={() => deleteTask(task.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function CalendarView({ user, tasks }) {
  const [newTitle, setNewTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');

  const [showPastEvents, setShowPastEvents] = useState(false);
  const [todayKey, setTodayKey] = useState(() =>
    getLocalDateKey(new Date())
  );

  // Refresh the date at local midnight and when returning to the tab.
  useEffect(() => {
    let timeoutId;

    const refreshDate = () => {
      const now = new Date();

      setTodayKey(getLocalDateKey(now));

      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1
      );

      window.clearTimeout(timeoutId);

      timeoutId = window.setTimeout(
        refreshDate,
        nextMidnight.getTime() - now.getTime() + 100
      );
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshDate();
      }
    };

    refreshDate();

    window.addEventListener('focus', refreshDate);
    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    );

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('focus', refreshDate);
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );
    };
  }, []);

  // One rolling calendar month, including shorter-month handling.
  const pastMonthStart = useMemo(() => {
    const [year, month, day] = todayKey.split('-').map(Number);

    const lastDayOfPreviousMonth = new Date(
      year,
      month - 1,
      0
    ).getDate();

    return getLocalDateKey(
      new Date(
        year,
        month - 2,
        Math.min(day, lastDayOfPreviousMonth)
      )
    );
  }, [todayKey]);

  const calendarItems = useMemo(() => {
    const firstVisibleDate = showPastEvents
      ? pastMonthStart
      : todayKey;

    return tasks
      .filter(
        item =>
          !item.completed &&
          typeof item.dueDate === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) &&
          item.dueDate >= firstVisibleDate
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [tasks, showPastEvents, todayKey, pastMonthStart]);

  const getRelativeDayLabel = value => {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value;

    const [todayYear, todayMonth, todayDay] =
      todayKey.split('-').map(Number);

    const difference = Math.round(
      (
        Date.UTC(year, month - 1, day) -
        Date.UTC(todayYear, todayMonth - 1, todayDay)
      ) / 86400000
    );

    if (difference === 0) return 'Today';
    if (difference === 1) return 'Tomorrow';
    if (difference > 1) return `In ${difference} days`;
    if (difference === -1) return 'Yesterday';

    return `${Math.abs(difference)} days ago`;
  };

  const handleAddEvent = async e => {
    e.preventDefault();
    if (saving) return;

    if (!newTitle.trim() || !eventDate) {
      setError('Enter an event name and choose a date.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await addDoc(collection(db, 'tasks'), {
        scope: 'calendar',
        owner: null,
        author: getAuthorInitial(user),
        title: newTitle.trim(),
        dueDate: eventDate,
        completed: false,
        createdAt: serverTimestamp(),
        completedAt: null
      });

      setNewTitle('');
      setEventDate('');
    } catch (err) {
      console.error('Error adding calendar event:', err);
      setError(
        'Could not save the event. Check your connection and Firebase permissions.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async item => {
    // Existing dated tasks are reference items in this view.
    if (item.scope !== 'calendar' || deletingId) return;

    const confirmed = window.confirm(
      `Delete the event "${item.title}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingId(item.id);
    setError('');

    try {
      await deleteDoc(doc(db, 'tasks', item.id));
    } catch (err) {
      console.error('Error deleting calendar event:', err);
      setError('Could not delete the event. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black uppercase flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#D946EF]" />
            Calendar
          </h2>

          <p className="text-xs text-gray-500">
            Add dated events here. Ordinary to-do items do not need dates.
          </p>
        </div>

        <span className="shrink-0 text-xs font-black bg-fuchsia-100 text-fuchsia-800 px-2 py-1">
          {calendarItems.length} shown
        </span>
      </div>

      <form
        onSubmit={handleAddEvent}
        className="bg-white p-4 border border-gray-200 space-y-3"
      >
        <h3 className="text-xs font-black text-[#D946EF] uppercase tracking-wider">
          Add an event
        </h3>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="flex-1 min-w-0 text-xs font-bold">
            Event

            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="e.g. Dentist appointment or school meeting"
              required
              disabled={saving}
              className="block mt-1 w-full min-h-[44px] px-3 bg-gray-50 border border-gray-300 text-sm font-bold text-[#1F2937]"
            />
          </label>

          <label className="text-xs font-bold">
            Date

            <input
              type="date"
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              required
              disabled={saving}
              className="block mt-1 w-full min-h-[44px] px-3 bg-gray-50 border border-gray-300 text-sm font-bold text-[#1F2937]"
            />
          </label>

          <button
            type="submit"
            disabled={saving || !newTitle.trim() || !eventDate}
            className="min-h-[44px] px-6 bg-[#D946EF] hover:bg-[#C026D3] disabled:opacity-50 disabled:cursor-not-allowed text-white font-black uppercase text-sm"
          >
            {saving ? 'Saving...' : '+ Add event'}
          </button>
        </div>
      </form>

      {error && (
        <p
          role="alert"
          className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold"
        >
          {error}
        </p>
      )}

      <div className="bg-white p-4 border border-gray-200 space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
          <input
            type="checkbox"
            checked={showPastEvents}
            onChange={e => setShowPastEvents(e.target.checked)}
            className="w-4 h-4 accent-fuchsia-600"
          />
          Show past events
        </label>

        <p className="text-xs text-gray-500">
          {showPastEvents
            ? `Showing today and future events, plus past events from ${pastMonthStart} through yesterday.`
            : 'Showing today and future events. Turn this on to also see the past month.'}
        </p>
      </div>

      {calendarItems.length === 0 ? (
        <div className="bg-white p-8 text-center border border-gray-200">
          <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />

          <p className="text-sm font-bold text-gray-500">
            {showPastEvents
              ? 'No events in this date range.'
              : 'No upcoming events.'}
          </p>

          <p className="text-xs text-gray-400 mt-1">
            Add an event using the form above.
          </p>
        </div>
      ) : (
        <div className="bg-white p-4 border border-gray-200 space-y-3">
          {calendarItems.map(item => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 bg-gray-50 border border-gray-200 p-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <AuthorBadge
                    author={
                      item.author || item.owner?.charAt(0) || 'H'
                    }
                  />

                  <span className="font-black text-sm text-[#1F2937] break-words">
                    {item.title}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <time
                    dateTime={item.dueDate}
                    className="font-bold"
                  >
                    {item.dueDate}
                  </time>

                  <span
                    className={
                      item.dueDate < todayKey
                        ? 'text-gray-500'
                        : 'text-fuchsia-700 font-semibold'
                    }
                  >
                    {getRelativeDayLabel(item.dueDate)}
                  </span>

                  <span className="px-1.5 py-0.5 bg-fuchsia-100 text-fuchsia-800 uppercase text-[10px] font-black">
                    {item.scope === 'calendar'
                      ? 'Event'
                      : 'Existing dated task'}
                  </span>
                </div>
              </div>

              {item.scope === 'calendar' && (
                <button
                  type="button"
                  onClick={() => handleDeleteEvent(item)}
                  disabled={Boolean(deletingId)}
                  aria-label={`Delete event: ${item.title}`}
                  title="Delete event"
                  className="shrink-0 min-h-[40px] min-w-[40px] p-2 text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center justify-center"
                >
                  {deletingId === item.id ? (
                    <span className="text-xs">...</span>
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuthorBadge({ author }) {
  return (
    <span
      className="shrink-0 w-5 h-5 inline-flex items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-800 text-[10px] font-black"
      title="Task author"
    >
      {author}
    </span>
  );
}

function TaskItemRow({ task, badgeBg, onToggle, onDelete }) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 bg-gray-50 border border-gray-200">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button
          onClick={onToggle}
          aria-label={
            task.completed ? 'Mark task incomplete' : 'Complete task'
          }
          className={`min-h-[40px] min-w-[40px] flex items-center justify-center border ${
            task.completed
              ? 'bg-emerald-600 border-emerald-600 text-white'
              : 'bg-white border-gray-300'
          }`}
        >
          <Check
            className={`w-5 h-5 stroke-[3] ${
              task.completed ? 'text-white' : 'text-gray-300'
            }`}
          />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {task.author && <AuthorBadge author={task.author} />}

            <span
              className={`block text-sm leading-snug break-words ${
                task.completed
                  ? 'line-through text-gray-400 font-medium'
                  : 'text-[#1F2937] font-bold'
              }`}
            >
              {task.title}
            </span>
          </div>

          <div className="flex items-center gap-1 mt-0.5">
            {task.section && (
              <span
                className={`inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.2 font-black ${
                  badgeBg || 'bg-[#D946EF] text-white'
                }`}
              >
                {task.section}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {task.imageUrl && (
          <a
            href={task.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] min-w-[40px] border border-gray-300 overflow-hidden block relative"
          >
            <img
              src={task.imageUrl}
              alt="Task attachment"
              className="w-full h-full object-cover"
            />
          </a>
        )}

        <button
          onClick={onDelete}
          className="min-h-[40px] min-w-[40px] p-2 text-red-600 hover:bg-red-50 flex items-center justify-center"
        >
          <Trash2 className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
}

function GroceryShoppingView({ items }) {
  const [newTitle, setNewTitle] = useState('');
  const [selectedStore, setSelectedStore] = useState('Prisma');
  const [quantity, setQuantity] = useState(1);
  const [photoUrl, setPhotoUrl] = useState('');
  const [showPhotoInput, setShowPhotoInput] = useState(false);

  const groceryItems = useMemo(
    () => items.filter(item => item.listType === 'grocery'),
    [items]
  );

  const suggestions = useFrequentSuggestions(groceryItems, newTitle);

  const handleQuickAdd = async e => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await addDoc(collection(db, 'shopping_items'), {
        listType: 'grocery',
        storeSection: selectedStore,
        title: newTitle.trim(),
        quantity: Number(quantity) || 1,
        completed: false,
        imageUrl: photoUrl.trim() || null,
        createdAt: serverTimestamp(),
        completedAt: null
      });

      setNewTitle('');
      setQuantity(1);
      setPhotoUrl('');
      setShowPhotoInput(false);
    } catch (err) {
      console.error('Error adding grocery item:', err);
    }
  };

  const toggleItem = async item => {
    try {
      await updateDoc(doc(db, 'shopping_items', item.id), {
        completed: !item.completed,
        completedAt: !item.completed ? new Date().toISOString() : null
      });
    } catch (err) {
      console.error('Error toggling item:', err);
    }
  };

  const updateQuantity = async (item, delta) => {
    const newQty = Math.max(1, (item.quantity || 1) + delta);

    try {
      await updateDoc(doc(db, 'shopping_items', item.id), {
        quantity: newQty
      });
    } catch (err) {
      console.error('Error updating quantity:', err);
    }
  };

  const deleteItem = async itemId => {
    try {
      await deleteDoc(doc(db, 'shopping_items', itemId));
    } catch (err) {
      console.error('Error deleting item:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 p-3 space-y-2">
        <form onSubmit={handleQuickAdd} className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="e.g. Milk, Bananas..."
              className="flex-1 min-h-[44px] px-3 bg-gray-50 border border-gray-300 text-sm font-bold text-[#1F2937]"
            />

            <div className="flex flex-wrap gap-2">
              <select
                value={selectedStore}
                onChange={e => setSelectedStore(e.target.value)}
                className="min-h-[44px] px-3 bg-gray-50 border border-gray-300 font-black text-sm text-[#1F2937]"
              >
                <option value="Prisma">Prisma</option>
                <option value="Lidl">Lidl</option>
              </select>

              <div className="flex items-center bg-gray-50 border border-gray-300">
                <button
                  type="button"
                  onClick={() =>
                    setQuantity(previous => Math.max(1, previous - 1))
                  }
                  className="min-h-[40px] min-w-[36px] font-black text-base text-[#1F2937]"
                >
                  -
                </button>

                <span className="px-2 font-black text-sm text-[#1F2937]">
                  {quantity}
                </span>

                <button
                  type="button"
                  onClick={() => setQuantity(previous => previous + 1)}
                  className="min-h-[40px] min-w-[36px] font-black text-base text-[#1F2937]"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowPhotoInput(!showPhotoInput)}
                className={`min-h-[44px] px-3 flex items-center justify-center ${
                  photoUrl || showPhotoInput
                    ? 'bg-[#D946EF] text-white'
                    : 'bg-gray-100 text-[#1F2937]'
                }`}
              >
                <Camera className="w-5 h-5" />
              </button>

              <button
                type="submit"
                className="min-h-[44px] px-6 bg-[#D946EF] hover:bg-[#C026D3] text-white font-black text-sm uppercase"
              >
                + Add
              </button>
            </div>
          </div>

          {showPhotoInput && (
            <div className="flex gap-2 pt-1">
              <input
                type="url"
                value={photoUrl}
                onChange={e => setPhotoUrl(e.target.value)}
                placeholder="Image URL (optional)"
                className="flex-1 min-h-[40px] px-3 bg-gray-50 border border-gray-300 text-xs font-semibold"
              />
            </div>
          )}
        </form>

        <SmartPills
          suggestions={suggestions}
          onSelect={title => setNewTitle(title)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['Prisma', 'Lidl'].map(store => {
          const storeItems = groceryItems.filter(
            item => item.storeSection === store
          );

          const activeItems = storeItems.filter(item => !item.completed);

          const completedStoreItems = storeItems.filter(
            item => item.completed
          );

          return (
            <div
              key={store}
              className="bg-white border border-gray-200 p-4 flex flex-col justify-between"
            >
              <div>
                <div className="border-b border-gray-200 pb-2 mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-black text-[#1F2937] uppercase">
                    {store}
                  </h3>

                  <span className="text-[10px] bg-[#D946EF] text-white px-2 py-0.5 font-black uppercase">
                    {activeItems.length} items
                  </span>
                </div>

                {activeItems.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">
                    No items needed.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {activeItems.map(item => (
                      <ShoppingItemRow
                        key={item.id}
                        item={item}
                        onToggle={() => toggleItem(item)}
                        onUpdateQty={delta => updateQuantity(item, delta)}
                        onDelete={() => deleteItem(item.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {completedStoreItems.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-1">
                    Purchased ({completedStoreItems.length})
                  </p>

                  <div className="space-y-1.5 opacity-60">
                    {completedStoreItems.map(item => (
                      <ShoppingItemRow
                        key={item.id}
                        item={item}
                        onToggle={() => toggleItem(item)}
                        onUpdateQty={delta => updateQuantity(item, delta)}
                        onDelete={() => deleteItem(item.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OtherShoppingView({ items }) {
  const [newTitle, setNewTitle] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [photoUrl, setPhotoUrl] = useState('');
  const [showPhotoInput, setShowPhotoInput] = useState(false);

  const otherItems = useMemo(
    () => items.filter(item => item.listType === 'other'),
    [items]
  );

  const activeItems = useMemo(
    () => otherItems.filter(item => !item.completed),
    [otherItems]
  );

  const completedItems = useMemo(
    () => otherItems.filter(item => item.completed),
    [otherItems]
  );

  const handleQuickAdd = async e => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await addDoc(collection(db, 'shopping_items'), {
        listType: 'other',
        storeSection: 'general',
        title: newTitle.trim(),
        quantity: Number(quantity) || 1,
        completed: false,
        imageUrl: photoUrl.trim() || null,
        createdAt: serverTimestamp(),
        completedAt: null
      });

      setNewTitle('');
      setQuantity(1);
      setPhotoUrl('');
      setShowPhotoInput(false);
    } catch (err) {
      console.error('Error adding other item:', err);
    }
  };

  const toggleItem = async item => {
    try {
      await updateDoc(doc(db, 'shopping_items', item.id), {
        completed: !item.completed,
        completedAt: !item.completed ? new Date().toISOString() : null
      });
    } catch (err) {
      console.error('Error toggling item:', err);
    }
  };

  const updateQuantity = async (item, delta) => {
    const newQty = Math.max(1, (item.quantity || 1) + delta);

    try {
      await updateDoc(doc(db, 'shopping_items', item.id), {
        quantity: newQty
      });
    } catch (err) {
      console.error('Error updating quantity:', err);
    }
  };

  const deleteItem = async itemId => {
    try {
      await deleteDoc(doc(db, 'shopping_items', itemId));
    } catch (err) {
      console.error('Error deleting item:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 p-3 space-y-2">
        <form onSubmit={handleQuickAdd} className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="e.g. Batteries, Lightbulbs..."
              className="flex-1 min-h-[44px] px-3 bg-gray-50 border border-gray-300 text-sm font-bold text-[#1F2937]"
            />

            <div className="flex flex-wrap gap-2">
              <div className="flex items-center bg-gray-50 border border-gray-300">
                <button
                  type="button"
                  onClick={() =>
                    setQuantity(previous => Math.max(1, previous - 1))
                  }
                  className="min-h-[40px] min-w-[36px] font-black text-base text-[#1F2937]"
                >
                  -
                </button>

                <span className="px-2 font-black text-sm text-[#1F2937]">
                  {quantity}
                </span>

                <button
                  type="button"
                  onClick={() => setQuantity(previous => previous + 1)}
                  className="min-h-[40px] min-w-[36px] font-black text-base text-[#1F2937]"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowPhotoInput(!showPhotoInput)}
                className={`min-h-[44px] px-3 flex items-center justify-center ${
                  photoUrl || showPhotoInput
                    ? 'bg-[#D946EF] text-white'
                    : 'bg-gray-100 text-[#1F2937]'
                }`}
              >
                <Camera className="w-5 h-5" />
              </button>

              <button
                type="submit"
                className="min-h-[44px] px-6 bg-[#D946EF] hover:bg-[#C026D3] text-white font-black text-sm uppercase"
              >
                + Add
              </button>
            </div>
          </div>

          {showPhotoInput && (
            <div className="flex gap-2 pt-1">
              <input
                type="url"
                value={photoUrl}
                onChange={e => setPhotoUrl(e.target.value)}
                placeholder="Image URL (optional)"
                className="flex-1 min-h-[40px] px-3 bg-gray-50 border border-gray-300 text-xs font-semibold"
              />
            </div>
          )}
        </form>
      </div>

      <div className="bg-white border border-gray-200 p-4 space-y-3">
        <h3 className="text-xs font-black text-[#1F2937] uppercase tracking-wider">
          General Items ({activeItems.length})
        </h3>

        {activeItems.length === 0 ? (
          <p className="text-xs font-semibold text-gray-400 italic py-1">
            No items needed.
          </p>
        ) : (
          <div className="space-y-1.5">
            {activeItems.map(item => (
              <ShoppingItemRow
                key={item.id}
                item={item}
                onToggle={() => toggleItem(item)}
                onUpdateQty={delta => updateQuantity(item, delta)}
                onDelete={() => deleteItem(item.id)}
              />
            ))}
          </div>
        )}

        {completedItems.length > 0 && (
          <div className="pt-3 border-t border-gray-200 space-y-1.5 opacity-60">
            <h4 className="text-[10px] font-black text-gray-400 uppercase">
              Purchased ({completedItems.length})
            </h4>

            <div className="space-y-1.5">
              {completedItems.map(item => (
                <ShoppingItemRow
                  key={item.id}
                  item={item}
                  onToggle={() => toggleItem(item)}
                  onUpdateQty={delta => updateQuantity(item, delta)}
                  onDelete={() => deleteItem(item.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ShoppingItemRow({
  item,
  onToggle,
  onUpdateQty,
  onDelete
}) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 bg-gray-50 border border-gray-200">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button
          onClick={onToggle}
          aria-label={
            item.completed
              ? 'Mark item unpurchased'
              : 'Mark item purchased'
          }
          className={`min-h-[40px] min-w-[40px] flex items-center justify-center border ${
            item.completed
              ? 'bg-emerald-600 border-emerald-600 text-white'
              : 'bg-white border-gray-300'
          }`}
        >
          <Check
            className={`w-5 h-5 stroke-[3] ${
              item.completed ? 'text-white' : 'text-gray-300'
            }`}
          />
        </button>

        <span
          className={`text-sm flex-1 min-w-0 break-words ${
            item.completed
              ? 'line-through text-gray-400 font-medium'
              : 'text-[#1F2937] font-bold'
          }`}
        >
          {item.title}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {item.imageUrl && (
          <a
            href={item.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] min-w-[40px] border border-gray-300 overflow-hidden block relative"
          >
            <img
              src={item.imageUrl}
              alt="Shopping attachment"
              className="w-full h-full object-cover"
            />
          </a>
        )}

        {!item.completed && (
          <div className="flex items-center bg-white border border-gray-300">
            <button
              onClick={() => onUpdateQty(-1)}
              className="min-h-[36px] min-w-[32px] flex items-center justify-center text-[#1F2937] font-black text-xs"
            >
              <Minus className="w-3.5 h-3.5 stroke-[3]" />
            </button>

            <span className="min-w-[24px] text-center font-black text-xs text-[#1F2937]">
              {item.quantity || 1}
            </span>

            <button
              onClick={() => onUpdateQty(1)}
              className="min-h-[36px] min-w-[32px] flex items-center justify-center text-[#1F2937] font-black text-xs"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            </button>
          </div>
        )}

        <button
          onClick={onDelete}
          className="min-h-[40px] min-w-[40px] p-2 text-red-600 hover:bg-red-50 flex items-center justify-center"
        >
          <Trash2 className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
}

function AdminPanelView({ allowedUsers }) {
  const [emailInput, setEmailInput] = useState('');
  const [assignedNameInput, setAssignedNameInput] = useState('Member');

  const handleAddWhitelist = async e => {
    e.preventDefault();
    if (!emailInput.trim()) return;

    try {
      const email = emailInput.trim().toLowerCase();

      await setDoc(doc(db, 'allowed_users', email), {
        email,
        assignedName: assignedNameInput.trim() || 'Member',
        addedAt: serverTimestamp()
      });

      setEmailInput('');
      setAssignedNameInput('Member');
    } catch (err) {
      console.error('Error adding to whitelist:', err);
    }
  };

  const handleRemoveWhitelist = async docId => {
    try {
      await deleteDoc(doc(db, 'allowed_users', docId));
    } catch (err) {
      console.error('Error removing from whitelist:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black uppercase">
          Household Access Control
        </h2>

        <p className="text-xs text-gray-500">
          Authorized Google accounts permitted to enter CHAOS CONTROL.
        </p>
      </div>

      <form
        onSubmit={handleAddWhitelist}
        className="bg-white p-4 border border-gray-200 space-y-3"
      >
        <h3 className="text-xs font-black text-[#D946EF] uppercase tracking-wider">
          Authorize New Email
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-extrabold text-[#1F2937] mb-1">
              Google Email
            </label>

            <input
              type="email"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              placeholder="e.g. user@gmail.com"
              className="w-full min-h-[44px] px-3 bg-gray-50 border border-gray-300 text-xs font-bold text-[#1F2937]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-[#1F2937] mb-1">
              Display Label
            </label>

            <input
              type="text"
              value={assignedNameInput}
              onChange={e => setAssignedNameInput(e.target.value)}
              placeholder="Otto | Johanna | Member"
              className="w-full min-h-[44px] px-3 bg-gray-50 border border-gray-300 text-xs font-bold text-[#1F2937]"
            />
          </div>
        </div>

        <div className="pt-1 flex justify-end">
          <button
            type="submit"
            className="min-h-[44px] px-6 bg-[#D946EF] hover:bg-[#C026D3] text-white font-black text-xs uppercase"
          >
            Authorize User
          </button>
        </div>
      </form>

      <div className="bg-white p-4 border border-gray-200">
        <h3 className="text-xs font-black text-[#1F2937] uppercase tracking-wider mb-3">
          Whitelisted Accounts ({allowedUsers.length + 1})
        </h3>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200">
            <div>
              <p className="font-black text-emerald-800 text-xs">
                {PRIMARY_ADMIN_EMAIL}
              </p>

              <span className="text-[10px] text-emerald-600 font-bold uppercase">
                Primary Administrator
              </span>
            </div>

            <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 font-black uppercase">
              Owner
            </span>
          </div>

          {allowedUsers.map(item => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200"
            >
              <div>
                <p className="font-bold text-[#1F2937] text-xs">
                  {item.email}
                </p>

                <p className="text-[10px] text-gray-500">
                  Label:{' '}
                  <strong className="text-[#1F2937]">
                    {item.assignedName || 'Member'}
                  </strong>
                </p>
              </div>

              <button
                onClick={() => handleRemoveWhitelist(item.id)}
                className="min-h-[36px] px-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
