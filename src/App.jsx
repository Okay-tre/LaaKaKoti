import React, {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
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
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
  deleteField,
  query,
  where,
  orderBy,
  limit,
  Timestamp
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
  Sun,
  X
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

// Keep these aligned with the email addresses in your Firestore rules.
const PRIMARY_ADMIN_EMAIL = 'patteri6907@gmail.com';
const AUTHORIZED_EMAILS = [
  PRIMARY_ADMIN_EMAIL,
  'laakkjiii@gmail.com'
];

const ROOMS = [
  'Kitchen',
  'Living room',
  'Kids room',
  'Bathroom',
  'Parents room'
];

const PHOTO_LIFETIME = 14 * 24 * 60 * 60 * 1000;
const PHOTO_TARGET_BYTES = 220 * 1024;
const PHOTO_TEXT_LIMIT = 350000;

const INPUT_CLASS =
  'min-h-[44px] px-3 bg-gray-50 border border-gray-300 text-sm font-bold text-[#1F2937]';

const BUTTON_CLASS =
  'min-h-[44px] px-4 bg-[#D946EF] hover:bg-[#C026D3] disabled:opacity-50 disabled:cursor-not-allowed text-white font-black uppercase text-xs';

const PANEL_CLASS =
  'bg-white p-4 border border-gray-200 space-y-3';

function authorInitial(user) {
  return (user?.displayName || user?.email || '?')
    .trim()
    .charAt(0)
    .toUpperCase();
}

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function timeMillis(value) {
  if (!value) return null;

  if (typeof value.toMillis === 'function') {
    return value.toMillis();
  }

  if (typeof value.seconds === 'number') {
    return value.seconds * 1000;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function photoExpired(uploadedAt, now = Date.now()) {
  const uploaded = timeMillis(uploadedAt);

  return uploaded !== null &&
    now >= uploaded + PHOTO_LIFETIME;
}

function errorText(error) {
  if (error?.code === 'permission-denied') {
    return 'Firebase denied this operation. Check that the updated rules are published and you are signed in with an authorized email.';
  }

  if (error?.code === 'resource-exhausted') {
    return 'The Firebase usage limit has been reached. Please try again later.';
  }

  return error?.message ||
    'Something went wrong. Check your connection and try again.';
}

function ErrorNotice({ message }) {
  return message ? (
    <p
      role="alert"
      className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm"
    >
      {message}
    </p>
  ) : null;
}

function useFrequentSuggestions(items, input) {
  return useMemo(() => {
    const counts = new Map();

    items.forEach(item => {
      const title = item.title?.trim();

      if (title) {
        counts.set(title, (counts.get(title) || 0) + 1);
      }
    });

    return [...counts.entries()]
      .filter(([title]) =>
        title.toLowerCase().includes(input.toLowerCase())
      )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([title]) => title);
  }, [items, input]);
}

function SmartPills({ suggestions, onSelect, disabled }) {
  if (!suggestions.length) return null;

  return (
    <div className="flex gap-2 items-center overflow-x-auto py-1">
      <span className="text-xs font-bold text-gray-500">
        Frequent:
      </span>

      {suggestions.map(title => (
        <button
          key={title}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(title)}
          className="shrink-0 text-xs font-bold px-2.5 py-1 bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 rounded-full"
        >
          + {title}
        </button>
      ))}
    </div>
  );
}

// Process the image in the browser.
// The original full-resolution file is never uploaded.
async function decodePhoto(file) {
  if (typeof window.createImageBitmap === 'function') {
    try {
      return await window.createImageBitmap(file, {
        imageOrientation: 'from-image'
      });
    } catch {
      // Try the ordinary image decoder next.
    }
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise((resolve, reject) => {
      const image = new window.Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(
        new Error(
          'This photo format cannot be opened by your browser. Try a JPEG, PNG, WebP or screenshot.'
        )
      );

      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function compressPhoto(file) {
  if (!file || (file.type && !file.type.startsWith('image/'))) {
    throw new Error('Please select an image file.');
  }

  if (file.size > 25 * 1024 * 1024) {
    throw new Error('Please choose an image smaller than 25 MB.');
  }

  const image = await decodePhoto(file);
  const canvas = document.createElement('canvas');

  try {
    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;

    if (!originalWidth || !originalHeight) {
      throw new Error('The image is empty or unreadable.');
    }

    const scale = Math.min(
      1,
      1600 / Math.max(originalWidth, originalHeight)
    );

    let width = Math.max(
      1,
      Math.round(originalWidth * scale)
    );

    let height = Math.max(
      1,
      Math.round(originalHeight * scale)
    );

    for (let attempt = 0; attempt < 10; attempt += 1) {
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('This browser cannot process images.');
      }

      // JPEG has no transparency.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      for (const quality of [0.82, 0.68, 0.54, 0.4]) {
        const dataUrl = canvas.toDataURL(
          'image/jpeg',
          quality
        );

        const encoded = dataUrl.slice(
          dataUrl.indexOf(',') + 1
        );

        const padding = encoded.endsWith('==')
          ? 2
          : encoded.endsWith('=')
            ? 1
            : 0;

        const bytes =
          Math.floor(encoded.length * 3 / 4) - padding;

        if (
          dataUrl.startsWith('data:image/jpeg;base64,') &&
          bytes <= PHOTO_TARGET_BYTES &&
          dataUrl.length <= PHOTO_TEXT_LIMIT
        ) {
          return {
            dataUrl,
            bytes,
            width,
            height
          };
        }
      }

      width = Math.max(1, Math.floor(width * 0.75));
      height = Math.max(1, Math.floor(height * 0.75));
    }

    throw new Error(
      'This image could not be reduced enough. Please choose a smaller image.'
    );
  } finally {
    if (typeof image.close === 'function') {
      image.close();
    }

    canvas.width = 1;
    canvas.height = 1;
  }
}

function attachmentData(collectionName, itemId, photo) {
  return {
    itemCollection: collectionName,
    itemId,
    dataUrl: photo.dataUrl,
    uploadedAt: serverTimestamp()
  };
}

async function createItem(collectionName, data, photo) {
  const itemRef = doc(collection(db, collectionName));
  const batch = writeBatch(db);

  const itemData = {
    ...data,
    createdAt: serverTimestamp()
  };

  if (photo) {
    const imageRef = doc(collection(db, 'attachments'));

    itemData.imageAttachmentId = imageRef.id;
    itemData.imageUploadedAt = serverTimestamp();

    batch.set(
      imageRef,
      attachmentData(collectionName, itemRef.id, photo)
    );
  }

  batch.set(itemRef, itemData);
  await batch.commit();
}

async function replacePhoto(collectionName, itemId, photo) {
  const itemRef = doc(db, collectionName, itemId);
  const imageRef = doc(collection(db, 'attachments'));

  await runTransaction(db, async transaction => {
    const itemSnapshot = await transaction.get(itemRef);

    if (!itemSnapshot.exists()) {
      throw new Error(
        'This item was deleted. Refresh the list and try again.'
      );
    }

    const oldId = itemSnapshot.data().imageAttachmentId;

    transaction.set(
      imageRef,
      attachmentData(collectionName, itemId, photo)
    );

    transaction.update(itemRef, {
      imageAttachmentId: imageRef.id,
      imageUploadedAt: serverTimestamp(),
      imageUrl: deleteField()
    });

    if (oldId) {
      transaction.delete(doc(db, 'attachments', oldId));
    }
  });
}

async function removePhoto(collectionName, itemId) {
  const itemRef = doc(db, collectionName, itemId);

  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(itemRef);
    if (!snapshot.exists()) return;

    const oldId = snapshot.data().imageAttachmentId;

    if (oldId) {
      transaction.delete(doc(db, 'attachments', oldId));
    }

    transaction.update(itemRef, {
      imageAttachmentId: deleteField(),
      imageUploadedAt: deleteField(),
      imageUrl: deleteField()
    });
  });
}

async function deleteItem(collectionName, itemId) {
  const itemRef = doc(db, collectionName, itemId);

  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(itemRef);
    if (!snapshot.exists()) return;

    const imageId = snapshot.data().imageAttachmentId;

    if (imageId) {
      transaction.delete(doc(db, 'attachments', imageId));
    }

    transaction.delete(itemRef);
  });
}

async function toggleItem(collectionName, item) {
  await updateDoc(doc(db, collectionName, item.id), {
    completed: !item.completed,
    completedAt: !item.completed
      ? serverTimestamp()
      : null
  });
}

async function cleanupExpiredPhotos() {
  const cutoff = Timestamp.fromMillis(
    Date.now() - PHOTO_LIFETIME
  );

  // Only read expired attachments, in small batches.
  // This is not Firestore TTL or a paid background function.
  for (;;) {
    const result = await getDocs(
      query(
        collection(db, 'attachments'),
        where('uploadedAt', '<=', cutoff),
        orderBy('uploadedAt'),
        limit(25)
      )
    );

    if (result.empty) return;

    for (const candidate of result.docs) {
      await runTransaction(db, async transaction => {
        const image = await transaction.get(candidate.ref);

        if (
          !image.exists() ||
          !photoExpired(image.data().uploadedAt)
        ) {
          return;
        }

        const data = image.data();

        const validParent =
          ['tasks', 'shopping_items'].includes(
            data.itemCollection
          ) &&
          typeof data.itemId === 'string' &&
          data.itemId &&
          !data.itemId.includes('/');

        const itemRef = validParent
          ? doc(db, data.itemCollection, data.itemId)
          : null;

        const item = itemRef
          ? await transaction.get(itemRef)
          : null;

        transaction.delete(candidate.ref);

        // Never clear a newer replacement photo.
        if (
          item?.exists() &&
          item.data().imageAttachmentId === image.id
        ) {
          transaction.update(itemRef, {
            imageAttachmentId: deleteField(),
            imageUploadedAt: deleteField()
          });
        }
      });
    }
  }
}

function usePhotoCleanup(enabled) {
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) {
      setError('');
      return;
    }

    let active = true;
    let running = false;

    const clean = async () => {
      if (!active || running) return;
      running = true;

      try {
        await cleanupExpiredPhotos();

        if (active) setError('');
      } catch (err) {
        console.error('Photo cleanup:', err);

        if (active) {
          setError(
            'Expired photos are hidden, but cleanup could not finish. Check your connection and the attachment rules. It will retry while the app is open.'
          );
        }
      } finally {
        running = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') clean();
    };

    clean();

    const timer = window.setInterval(
      clean,
      10 * 60 * 1000
    );

    window.addEventListener('focus', clean);
    document.addEventListener(
      'visibilitychange',
      onVisible
    );

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', clean);
      document.removeEventListener(
        'visibilitychange',
        onVisible
      );
    };
  }, [enabled]);

  return error;
}

function PhotoPicker({
  photo,
  onChange,
  processing,
  onProcessing,
  disabled
}) {
  const input = useRef(null);
  const [error, setError] = useState('');

  const choose = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setError('');
    onProcessing(true);

    try {
      onChange(await compressPhoto(file));
    } catch (err) {
      setError(errorText(err));
    } finally {
      onProcessing(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        onChange={choose}
        disabled={disabled || processing}
        className="hidden"
      />

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled || processing}
        className="min-h-[40px] px-3 bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-700 font-bold text-xs inline-flex items-center gap-2 disabled:opacity-50"
      >
        <Camera className="w-4 h-4" />

        {processing
          ? 'Compressing photo...'
          : photo
            ? 'Change photo'
            : 'Add picture'}
      </button>

      {photo && (
        <div className="flex items-center gap-3">
          <img
            src={photo.dataUrl}
            alt="Selected attachment preview"
            className="w-20 h-20 object-cover border border-gray-200"
          />

          <p className="text-xs text-gray-500">
            {photo.width} × {photo.height}
            {' · '}
            {Math.ceil(photo.bytes / 1024)} KB
            <br />
            Automatically compressed.
            Expires 14 days after saving.
          </p>

          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled || processing}
            aria-label="Remove selected photo"
            className="p-2 text-red-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <ErrorNotice message={error} />
    </div>
  );
}

function PhotoAttachment({ item, collectionName, now }) {
  const input = useRef(null);
  const [opened, setOpened] = useState(false);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const expired = photoExpired(
    item.imageUploadedAt,
    now
  );

  const freshImage = Boolean(
    image &&
    image.id === item.imageAttachmentId &&
    !photoExpired(image.uploadedAt, now)
  );

  const legacyUrl =
    !item.imageAttachmentId &&
    /^https?:\/\//i.test(item.imageUrl || '')
      ? item.imageUrl
      : null;

  const hasPhoto = Boolean(
    item.imageAttachmentId || legacyUrl
  );

  useEffect(() => {
    let active = true;

    setImage(null);
    setError('');
    setLoading(false);

    if (
      !opened ||
      !item.imageAttachmentId ||
      expired
    ) {
      return () => {
        active = false;
      };
    }

    setLoading(true);

    getDoc(doc(db, 'attachments', item.imageAttachmentId))
      .then(snapshot => {
        if (!active) return;

        if (!snapshot.exists()) {
          setError('This photo is no longer available.');
          return;
        }

        const data = snapshot.data();

        if (
          !photoExpired(data.uploadedAt) &&
          /^data:image\/jpeg;base64,/.test(data.dataUrl || '')
        ) {
          setImage({
            id: snapshot.id,
            ...data
          });
        } else {
          setError('This photo has expired.');
        }
      })
      .catch(err => {
        if (active) setError(errorText(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [opened, item.imageAttachmentId, expired]);

  const choose = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || busy) return;

    setBusy(true);
    setError('');

    try {
      const photo = await compressPhoto(file);

      await replacePhoto(
        collectionName,
        item.id,
        photo
      );

      setOpened(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(
      'Remove this photo? The item itself will stay.'
    )) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      await removePhoto(collectionName, item.id);
      setImage(null);
      setOpened(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        onChange={choose}
        disabled={busy}
        className="hidden"
      />

      <div className="flex flex-wrap gap-2 items-center text-xs">
        {hasPhoto && !expired && (
          <button
            type="button"
            onClick={() => setOpened(value => !value)}
            className="min-h-[36px] text-fuchsia-700 font-bold inline-flex items-center gap-1"
          >
            <ImageIcon className="w-4 h-4" />
            {opened ? 'Hide photo' : 'View photo'}
          </button>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="min-h-[36px] text-gray-600 font-bold inline-flex items-center gap-1 disabled:opacity-50"
        >
          <Camera className="w-4 h-4" />

          {busy
            ? 'Processing...'
            : hasPhoto
              ? 'Replace photo'
              : 'Add picture'}
        </button>

        {hasPhoto && (
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="min-h-[36px] text-red-600 font-bold"
          >
            Remove photo
          </button>
        )}

        {expired && (
          <span className="text-gray-500">
            Photo expired
          </span>
        )}
      </div>

      {opened && !expired && (
        <div>
          {loading && (
            <p className="text-xs text-gray-500">
              Loading photo...
            </p>
          )}

          {freshImage && (
            <img
              src={image.dataUrl}
              alt={`Attachment for ${item.title}`}
              className="max-w-full max-h-96 object-contain border border-gray-200"
            />
          )}

          {legacyUrl && (
            <a
              href={legacyUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={legacyUrl}
                alt={`Attachment for ${item.title}`}
                className="max-w-full max-h-96 object-contain"
              />
            </a>
          )}

          {legacyUrl && (
            <p className="text-xs text-gray-500">
              External image: the 14-day cleanup applies
              only to new uploads.
            </p>
          )}
        </div>
      )}

      <ErrorNotice message={error} />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('morning');
  const [personalOwner, setPersonalOwner] = useState('Johanna');
  const [tasks, setTasks] = useState([]);
  const [shoppingItems, setShoppingItems] = useState([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const email = user?.email?.toLowerCase() || '';
  const authorized = AUTHORIZED_EMAILS.includes(email);
  const isAdmin = email === PRIMARY_ADMIN_EMAIL;

  const cleanupError = usePhotoCleanup(
    Boolean(user && authorized)
  );

  useEffect(() => {
    return onAuthStateChanged(auth, current => {
      setUser(current);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    const refresh = () => setNow(Date.now());

    const visible = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    const timer = window.setInterval(refresh, 60000);

    window.addEventListener('focus', refresh);
    document.addEventListener(
      'visibilitychange',
      visible
    );

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener(
        'visibilitychange',
        visible
      );
    };
  }, []);

  useEffect(() => {
    setTasks([]);
    setShoppingItems([]);
    setError('');

    if (!user || !authorized) return;

    const read = setter => snapshot => {
      setter(
        snapshot.docs.map(item => ({
          ...item.data(),
          id: item.id
        }))
      );
    };

    const failed = err => setError(errorText(err));

    const stopTasks = onSnapshot(
      collection(db, 'tasks'),
      read(setTasks),
      failed
    );

    const stopShopping = onSnapshot(
      collection(db, 'shopping_items'),
      read(setShoppingItems),
      failed
    );

    return () => {
      stopTasks();
      stopShopping();
    };
  }, [user, authorized]);

  const login = async () => {
    setError('');

    try {
      await signInWithPopup(
        auth,
        new GoogleAuthProvider()
      );
    } catch (err) {
      setError(errorText(err));
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      setError(errorText(err));
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F5F8] font-bold">
        Loading CHAOS CONTROL...
      </div>
    );
  }

  if (!user || !authorized) {
    return (
      <div className="min-h-screen bg-[#F4F5F8] flex items-center justify-center p-4">
        <div className={`${PANEL_CLASS} max-w-md w-full text-center`}>
          <h1 className="text-3xl font-black text-[#D946EF]">
            CHAOS CONTROL
          </h1>

          {user ? (
            <>
              <ShieldAlert className="w-10 h-10 mx-auto text-red-600" />
              <p>
                This account ({user.email}) is not one of
                the two authorized household accounts.
              </p>
            </>
          ) : (
            <p>
              Sign in with your authorized Google account.
            </p>
          )}

          <ErrorNotice message={error} />

          <button
            onClick={user ? logout : login}
            className={`${BUTTON_CLASS} w-full`}
          >
            {user ? 'Sign out' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    {
      id: 'morning',
      label: 'Morning',
      short: 'Morning',
      Icon: Sun
    },
    {
      id: 'household',
      label: 'Household To-Do',
      short: 'Home',
      Icon: Home
    },
    {
      id: 'personal',
      label: 'Personal To-Do',
      short: 'Personal',
      Icon: User
    },
    {
      id: 'calendar',
      label: 'Calendar',
      short: 'Calendar',
      Icon: Calendar
    },
    {
      id: 'grocery',
      label: 'Grocery List',
      short: 'Grocery',
      Icon: ShoppingCart
    },
    {
      id: 'other',
      label: 'Other Shopping',
      short: 'Other',
      Icon: ImageIcon
    },
    ...(isAdmin
      ? [{
          id: 'admin',
          label: 'Admin Panel',
          short: 'Admin',
          Icon: UserCheck
        }]
      : [])
  ];

  return (
    <div className="min-h-screen bg-[#F4F5F8] text-[#1F2937] font-sans pb-24 md:pb-6">
      <header className="bg-[#D946EF] text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-5xl mx-auto px-4 pt-3 pb-2">
          <div className="flex justify-between items-center gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-black uppercase leading-none">
                CHAOS CONTROL
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-100">
                Household Hub
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden sm:block text-xs font-bold">
                {user.displayName || user.email}
              </span>

              <button
                onClick={logout}
                title="Sign out"
                className="p-2 border border-white/30"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>

          <nav className="hidden md:flex gap-1 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-xs font-black uppercase whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-fuchsia-600'
                    : 'hover:bg-fuchsia-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-3">
        <ErrorNotice message={error} />
        <ErrorNotice message={cleanupError} />

        {activeTab === 'morning' && (
          <MorningToDoView
            user={user}
            tasks={tasks}
            now={now}
          />
        )}

        {activeTab === 'household' && (
          <HouseholdToDoView
            user={user}
            tasks={tasks}
            now={now}
          />
        )}

        {activeTab === 'personal' && (
          <PersonalToDoView
            user={user}
            tasks={tasks}
            now={now}
            owner={personalOwner}
            setOwner={setPersonalOwner}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarView
            user={user}
            tasks={tasks}
            now={now}
          />
        )}

        {activeTab === 'grocery' && (
          <ShoppingView
            key="grocery"
            listType="grocery"
            items={shoppingItems}
            now={now}
          />
        )}

        {activeTab === 'other' && (
          <ShoppingView
            key="other"
            listType="other"
            items={shoppingItems}
            now={now}
          />
        )}

        {activeTab === 'admin' && isAdmin && (
          <AdminPanelView />
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-[#D946EF] text-white flex md:hidden z-40 p-1">
        {tabs.map(({ id, short, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 min-w-0 min-h-[48px] flex flex-col items-center justify-center ${
              activeTab === id
                ? 'bg-white text-fuchsia-600'
                : ''
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[9px] font-bold">
              {short}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function TaskForm({
  user,
  scope,
  owner = null,
  items
}) {
  const [title, setTitle] = useState('');
  const [section, setSection] = useState('Kitchen');
  const [photo, setPhoto] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const suggestions = useFrequentSuggestions(
    items,
    title
  );

  const save = async event => {
    event.preventDefault();

    if (!title.trim() || saving || processing) return;

    setSaving(true);
    setError('');

    try {
      await createItem(
        'tasks',
        {
          scope,
          owner,
          author: authorInitial(user),
          title: title.trim(),
          section: scope === 'household' ? section : null,
          completed: false,
          completedAt: null
        },
        photo
      );

      setTitle('');
      setPhoto(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className={PANEL_CLASS}>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          disabled={saving}
          placeholder={
            scope === 'personal'
              ? `Add personal task for ${owner}...`
              : scope === 'morning'
                ? 'Add morning task...'
                : 'Write a quick task...'
          }
          className={`${INPUT_CLASS} flex-1 min-w-0`}
        />

        {scope === 'household' && (
          <select
            value={section}
            onChange={e => setSection(e.target.value)}
            disabled={saving}
            className={INPUT_CLASS}
          >
            {ROOMS.map(room => (
              <option key={room}>{room}</option>
            ))}
          </select>
        )}

        <button
          type="submit"
          disabled={saving || processing || !title.trim()}
          className={BUTTON_CLASS}
        >
          {saving ? 'Saving...' : '+ Add task'}
        </button>
      </div>

      <PhotoPicker
        photo={photo}
        onChange={setPhoto}
        processing={processing}
        onProcessing={setProcessing}
        disabled={saving}
      />

      {scope !== 'personal' && (
        <SmartPills
          suggestions={suggestions}
          onSelect={setTitle}
          disabled={saving}
        />
      )}

      <ErrorNotice message={error} />
    </form>
  );
}

function AuthorBadge({ author }) {
  return (
    <span
      title="Author"
      className="shrink-0 w-5 h-5 rounded-full bg-fuchsia-100 text-fuchsia-800 text-[10px] font-black inline-flex items-center justify-center"
    >
      {author}
    </span>
  );
}

function ItemRow({
  item,
  collectionName,
  now,
  shopping = false
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const perform = async action => {
    if (busy) return;

    setBusy(true);
    setError('');

    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (window.confirm(
      `Delete "${item.title}" and its uploaded photo?`
    )) {
      perform(() => deleteItem(collectionName, item.id));
    }
  };

  const changeQuantity = delta => perform(() =>
    runTransaction(db, async transaction => {
      const ref = doc(db, collectionName, item.id);
      const snapshot = await transaction.get(ref);

      if (!snapshot.exists()) return;

      transaction.update(ref, {
        quantity: Math.max(
          1,
          (Number(snapshot.data().quantity) || 1) + delta
        )
      });
    })
  );

  return (
    <div className="p-2 bg-gray-50 border border-gray-200 space-y-1">
      <div className="flex items-center gap-2">
        <button
          disabled={busy}
          onClick={() =>
            perform(() => toggleItem(collectionName, item))
          }
          aria-label={
            item.completed
              ? 'Mark incomplete'
              : 'Mark completed'
          }
          className={`shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center border ${
            item.completed
              ? 'bg-emerald-600 border-emerald-600 text-white'
              : 'bg-white border-gray-300 text-gray-300'
          }`}
        >
          <Check className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex gap-1.5 items-center">
            {item.author && (
              <AuthorBadge author={item.author} />
            )}

            <span
              className={`text-sm break-words ${
                item.completed
                  ? 'line-through text-gray-400'
                  : 'font-bold'
              }`}
            >
              {item.title}
            </span>
          </div>

          {item.section && (
            <span className="text-[10px] uppercase font-bold text-fuchsia-700">
              {item.section}
            </span>
          )}
        </div>

        {shopping && !item.completed && (
          <div className="flex items-center border bg-white">
            <button
              disabled={busy}
              onClick={() => changeQuantity(-1)}
              aria-label="Decrease quantity"
              className="min-w-[30px] min-h-[36px] flex items-center justify-center"
            >
              <Minus className="w-3 h-3" />
            </button>

            <span className="text-xs font-bold">
              {item.quantity || 1}
            </span>

            <button
              disabled={busy}
              onClick={() => changeQuantity(1)}
              aria-label="Increase quantity"
              className="min-w-[30px] min-h-[36px] flex items-center justify-center"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        )}

        <button
          disabled={busy}
          onClick={remove}
          aria-label="Delete item"
          className="shrink-0 p-2 text-red-600"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <PhotoAttachment
        item={item}
        collectionName={collectionName}
        now={now}
      />

      <ErrorNotice message={error} />
    </div>
  );
}

function TaskList({
  items,
  now,
  empty = 'Nothing pending.'
}) {
  return items.length ? (
    <div className="space-y-2">
      {items.map(item => (
        <ItemRow
          key={item.id}
          item={item}
          collectionName="tasks"
          now={now}
        />
      ))}
    </div>
  ) : (
    <p className="text-xs text-gray-400 italic">
      {empty}
    </p>
  );
}

function MorningToDoView({ user, tasks, now }) {
  const items = useMemo(
    () => tasks.filter(item => item.scope === 'morning'),
    [tasks]
  );

  const active = items.filter(item => !item.completed);
  const completed = items.filter(item => item.completed);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-black uppercase flex gap-2 items-center">
        <Sun className="w-5 h-5 text-amber-500" />
        Morning Checklist
      </h2>

      <TaskForm
        user={user}
        scope="morning"
        items={items}
      />

      <section className={PANEL_CLASS}>
        <h3 className="text-xs font-black uppercase">
          Active Morning Routine ({active.length})
        </h3>

        <TaskList
          items={active}
          now={now}
          empty="Morning routine complete!"
        />
      </section>

      {completed.length > 0 && (
        <section className={PANEL_CLASS}>
          <h3 className="text-xs font-black uppercase text-gray-500">
            Completed ({completed.length})
          </h3>

          <TaskList items={completed} now={now} />
        </section>
      )}
    </div>
  );
}

function HouseholdToDoView({ user, tasks, now }) {
  const [months, setMonths] = useState(1);
  const [expanded, setExpanded] = useState(false);

  const items = useMemo(
    () => tasks.filter(item => item.scope === 'household'),
    [tasks]
  );

  const active = items.filter(item => !item.completed);

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);

  const completed = items.filter(
    item =>
      item.completed &&
      (
        !item.completedAt ||
        timeMillis(item.completedAt) >= cutoff.getTime()
      )
  );

  return (
    <div className="space-y-4">
      <TaskForm
        user={user}
        scope="household"
        items={items}
      />

      <div className="grid md:grid-cols-2 gap-4">
        {ROOMS.map(room => {
          const roomTasks = active.filter(
            item => item.section === room
          );

          return (
            <section key={room} className={PANEL_CLASS}>
              <h3 className="text-sm font-black uppercase border-b pb-2">
                {room} ({roomTasks.length})
              </h3>

              <TaskList
                items={roomTasks}
                now={now}
                empty="Empty list."
              />
            </section>
          );
        })}
      </div>

      <section className={PANEL_CLASS}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full min-h-[40px] flex justify-between items-center text-xs font-black uppercase"
        >
          Completed Tasks ({completed.length})

          {expanded
            ? <ChevronUp className="w-5 h-5" />
            : <ChevronDown className="w-5 h-5" />}
        </button>

        {expanded && (
          <>
            <p className="text-xs text-gray-500">
              Showing the past {months} month
              {months > 1 ? 's' : ''}.
            </p>

            <TaskList
              items={completed}
              now={now}
              empty="No completed tasks in range."
            />

            {months < 12 && (
              <button
                onClick={() =>
                  setMonths(value => Math.min(value + 1, 12))
                }
                className={BUTTON_CLASS}
              >
                Show 1 month more
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function PersonalToDoView({
  user,
  tasks,
  now,
  owner,
  setOwner
}) {
  const items = useMemo(
    () => tasks.filter(
      item =>
        item.scope === 'personal' &&
        item.owner === owner
    ),
    [tasks, owner]
  );

  const active = items.filter(item => !item.completed);
  const completed = items.filter(item => item.completed);

  return (
    <div className="space-y-4">
      <div className={`${PANEL_CLASS} flex flex-wrap items-center gap-2`}>
        <span className="text-xs font-bold">
          List Owner:
        </span>

        {['Johanna', 'Otto'].map(name => (
          <button
            key={name}
            onClick={() => setOwner(name)}
            className={`min-h-[40px] px-5 text-xs font-black uppercase ${
              owner === name
                ? 'bg-fuchsia-500 text-white'
                : 'bg-gray-100'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <TaskForm
        key={owner}
        user={user}
        scope="personal"
        owner={owner}
        items={items}
      />

      <section className={PANEL_CLASS}>
        <h3 className="text-xs font-black uppercase">
          {owner}'s Pending Tasks ({active.length})
        </h3>

        <TaskList items={active} now={now} />
      </section>

      {completed.length > 0 && (
        <section className={PANEL_CLASS}>
          <h3 className="text-xs font-black uppercase text-gray-500">
            Completed ({completed.length})
          </h3>

          <TaskList items={completed} now={now} />
        </section>
      )}
    </div>
  );
}

function CalendarView({ user, tasks, now }) {
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [photo, setPhoto] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [today, setToday] = useState(() =>
    dateKey(new Date())
  );

  useEffect(() => {
    let timer;

    const refresh = () => {
      const current = new Date();
      setToday(dateKey(current));

      const midnight = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() + 1
      );

      window.clearTimeout(timer);

      timer = window.setTimeout(
        refresh,
        midnight.getTime() - current.getTime() + 100
      );
    };

    const visible = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    refresh();

    window.addEventListener('focus', refresh);
    document.addEventListener(
      'visibilitychange',
      visible
    );

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener(
        'visibilitychange',
        visible
      );
    };
  }, []);

  const pastStart = useMemo(() => {
    const [year, month, day] = today.split('-').map(Number);

    const lastDayOfPreviousMonth = new Date(
      year,
      month - 1,
      0
    ).getDate();

    return dateKey(
      new Date(
        year,
        month - 2,
        Math.min(day, lastDayOfPreviousMonth)
      )
    );
  }, [today]);

  const items = useMemo(
    () => tasks
      .filter(
        item =>
          !item.completed &&
          typeof item.dueDate === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) &&
          item.dueDate >= (showPast ? pastStart : today)
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [tasks, showPast, pastStart, today]
  );

  const relativeDay = value => {
    const [y, m, d] = value.split('-').map(Number);
    const [ty, tm, td] = today.split('-').map(Number);

    const days = Math.round(
      (
        Date.UTC(y, m - 1, d) -
        Date.UTC(ty, tm - 1, td)
      ) / 86400000
    );

    return days === 0
      ? 'Today'
      : days === 1
        ? 'Tomorrow'
        : days === -1
          ? 'Yesterday'
          : days > 1
            ? `In ${days} days`
            : `${Math.abs(days)} days ago`;
  };

  const save = async event => {
    event.preventDefault();

    if (
      !title.trim() ||
      !eventDate ||
      saving ||
      processing
    ) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      await createItem(
        'tasks',
        {
          scope: 'calendar',
          owner: null,
          author: authorInitial(user),
          title: title.trim(),
          dueDate: eventDate,
          completed: false,
          completedAt: null
        },
        photo
      );

      setTitle('');
      setEventDate('');
      setPhoto(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async item => {
    if (
      deletingId ||
      !window.confirm(
        `Delete the event "${item.title}" and its uploaded photo?`
      )
    ) {
      return;
    }

    setDeletingId(item.id);
    setError('');

    try {
      await deleteItem('tasks', item.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-black uppercase flex items-center gap-2">
          <Calendar className="w-5 h-5 text-fuchsia-600" />
          Calendar
        </h2>

        <span className="text-xs font-bold">
          {items.length} shown
        </span>
      </div>

      <form onSubmit={save} className={PANEL_CLASS}>
        <h3 className="text-xs font-black uppercase text-fuchsia-600">
          Add an event
        </h3>

        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <label className="flex-1 text-xs font-bold">
            Event

            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              disabled={saving}
              placeholder="e.g. Dentist appointment"
              className={`${INPUT_CLASS} block w-full mt-1`}
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
              className={`${INPUT_CLASS} block w-full mt-1`}
            />
          </label>

          <button
            type="submit"
            disabled={
              saving ||
              processing ||
              !title.trim() ||
              !eventDate
            }
            className={BUTTON_CLASS}
          >
            {saving ? 'Saving...' : '+ Add event'}
          </button>
        </div>

        <PhotoPicker
          photo={photo}
          onChange={setPhoto}
          processing={processing}
          onProcessing={setProcessing}
          disabled={saving}
        />
      </form>

      <ErrorNotice message={error} />

      <div className={PANEL_CLASS}>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={showPast}
            onChange={e => setShowPast(e.target.checked)}
            className="w-4 h-4 accent-fuchsia-600"
          />
          Show past events
        </label>

        <p className="text-xs text-gray-500">
          {showPast
            ? `Showing today and future events, plus past events from ${pastStart} through yesterday.`
            : 'Showing today and future events. Turn this on to also see the past month.'}
        </p>
      </div>

      {items.length === 0 ? (
        <div className={`${PANEL_CLASS} text-center text-sm text-gray-500`}>
          {showPast
            ? 'No events in this date range.'
            : 'No upcoming events.'}
        </div>
      ) : (
        <div className={PANEL_CLASS}>
          {items.map(item => (
            <article
              key={item.id}
              className="p-3 border border-gray-200 bg-gray-50 space-y-2"
            >
              <div className="flex items-start gap-2">
                <AuthorBadge
                  author={
                    item.author ||
                    item.owner?.charAt(0) ||
                    'H'
                  }
                />

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black break-words">
                    {item.title}
                  </h3>

                  <p className="text-xs text-gray-500">
                    <time dateTime={item.dueDate}>
                      {item.dueDate}
                    </time>

                    {' · '}
                    {relativeDay(item.dueDate)}
                    {' · '}

                    {item.scope === 'calendar'
                      ? 'Event'
                      : 'Existing dated task'}
                  </p>
                </div>

                {item.scope === 'calendar' && (
                  <button
                    disabled={Boolean(deletingId)}
                    onClick={() => remove(item)}
                    aria-label="Delete event"
                    className="p-2 text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <PhotoAttachment
                item={item}
                collectionName="tasks"
                now={now}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ShoppingView({ listType, items, now }) {
  const [title, setTitle] = useState('');
  const [store, setStore] = useState('Prisma');
  const [quantity, setQuantity] = useState(1);
  const [photo, setPhoto] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const grocery = listType === 'grocery';

  const list = useMemo(
    () => items.filter(item => item.listType === listType),
    [items, listType]
  );

  const suggestions = useFrequentSuggestions(list, title);

  const save = async event => {
    event.preventDefault();

    if (!title.trim() || saving || processing) return;

    setSaving(true);
    setError('');

    try {
      await createItem(
        'shopping_items',
        {
          listType,
          storeSection: grocery ? store : 'general',
          title: title.trim(),
          quantity,
          completed: false,
          completedAt: null
        },
        photo
      );

      setTitle('');
      setQuantity(1);
      setPhoto(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const groups = grocery
    ? ['Prisma', 'Lidl']
    : ['General Items'];

  return (
    <div className="space-y-4">
      <form onSubmit={save} className={PANEL_CLASS}>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            disabled={saving}
            placeholder={
              grocery
                ? 'e.g. Milk, Bananas...'
                : 'e.g. Batteries, Lightbulbs...'
            }
            className={`${INPUT_CLASS} flex-1 min-w-0`}
          />

          <div className="flex flex-wrap items-center gap-2">
            {grocery && (
              <select
                value={store}
                onChange={e => setStore(e.target.value)}
                disabled={saving}
                className={INPUT_CLASS}
              >
                <option>Prisma</option>
                <option>Lidl</option>
              </select>
            )}

            <div className="flex items-center border bg-gray-50">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  setQuantity(value => Math.max(1, value - 1))
                }
                className="min-w-[36px] min-h-[44px]"
              >
                -
              </button>

              <span className="text-sm font-bold">
                {quantity}
              </span>

              <button
                type="button"
                disabled={saving}
                onClick={() => setQuantity(value => value + 1)}
                className="min-w-[36px] min-h-[44px]"
              >
                +
              </button>
            </div>

            <button
              type="submit"
              disabled={saving || processing || !title.trim()}
              className={BUTTON_CLASS}
            >
              {saving ? 'Saving...' : '+ Add'}
            </button>
          </div>
        </div>

        <PhotoPicker
          photo={photo}
          onChange={setPhoto}
          processing={processing}
          onProcessing={setProcessing}
          disabled={saving}
        />

        {grocery && (
          <SmartPills
            suggestions={suggestions}
            onSelect={setTitle}
            disabled={saving}
          />
        )}

        <ErrorNotice message={error} />
      </form>

      <div className={
        grocery
          ? 'grid md:grid-cols-2 gap-4'
          : 'space-y-4'
      }>
        {groups.map(group => {
          const groupItems = grocery
            ? list.filter(item => item.storeSection === group)
            : list;

          const active = groupItems.filter(
            item => !item.completed
          );

          const completed = groupItems.filter(
            item => item.completed
          );

          return (
            <section key={group} className={PANEL_CLASS}>
              <h3 className="text-sm font-black uppercase border-b pb-2">
                {group} ({active.length})
              </h3>

              {active.length ? (
                active.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    collectionName="shopping_items"
                    now={now}
                    shopping
                  />
                ))
              ) : (
                <p className="text-xs text-gray-400 italic">
                  No items needed.
                </p>
              )}

              {completed.length > 0 && (
                <div className="pt-3 border-t space-y-2">
                  <h4 className="text-[10px] uppercase font-black text-gray-500">
                    Purchased ({completed.length})
                  </h4>

                  {completed.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      collectionName="shopping_items"
                      now={now}
                      shopping
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function AdminPanelView() {
  return (
    <section className={PANEL_CLASS}>
      <h2 className="text-lg font-black uppercase">
        Household Access
      </h2>

      <p className="text-sm text-gray-600">
        Access is controlled by the two email addresses
        in your deployed Firestore rules. The old whitelist
        form could not grant access under those rules.
      </p>

      {AUTHORIZED_EMAILS.map(email => (
        <div
          key={email}
          className="p-3 bg-emerald-50 border border-emerald-200 text-sm font-bold break-all"
        >
          {email}

          {email === PRIMARY_ADMIN_EMAIL && (
            <span className="block text-xs font-normal">
              Primary administrator
            </span>
          )}
        </div>
      ))}

      <p className="text-xs text-gray-500">
        To change household access, update both the Firebase
        rules and AUTHORIZED_EMAILS in this file.
        No existing whitelist documents have been deleted.
      </p>
    </section>
  );
}
