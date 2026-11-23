import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  getFirestore, collection, doc, getDoc, getDocs, onSnapshot,
  updateDoc, writeBatch, runTransaction, serverTimestamp, addDoc,
  deleteField, query, where, orderBy, limit, Timestamp
} from 'firebase/firestore';
import {
  Check, Plus, Trash2, Camera, LogOut, User, Home,
  ShoppingCart, ShieldAlert, ChevronDown, ChevronUp,
  Minus, Calendar, Image as ImageIcon, Sun, X, Loader2, Bell, Sparkles
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
const AI_ENDPOINT = 'https://chaos-control-ai.patteri6907.workers.dev/suggestions';

// Keep these aligned with the two email addresses in your Firestore rules.
const AUTHORIZED_EMAILS = ['patteri6907@gmail.com', 'laakkjiii@gmail.com'];
const ROOMS = ['Kitchen', 'Living room', 'Kids room', 'Bathroom', 'Parents room'];
const PHOTO_LIFETIME = 14 * 24 * 60 * 60 * 1000;
const PHOTO_TARGET_BYTES = 220 * 1024;
const PHOTO_TEXT_LIMIT = 350000;
const INPUT_CLASS = 'min-h-[44px] px-3 bg-gray-50 border border-gray-300 text-sm font-bold text-[#1F2937]';
const BUTTON_CLASS = 'min-h-[44px] px-4 bg-[#D946EF] hover:bg-[#C026D3] disabled:opacity-50 disabled:cursor-not-allowed text-white font-black uppercase text-xs';
const PANEL_CLASS = 'bg-white p-4 border border-gray-200 space-y-3';
const ICON_BUTTON_CLASS = 'shrink-0 w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-600 disabled:opacity-50 disabled:cursor-not-allowed';

function authorInitial(user) {
  return (user?.displayName || user?.email || '?').trim().charAt(0).toUpperCase();
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timeMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function photoExpired(uploadedAt, now = Date.now()) {
  const uploaded = timeMillis(uploadedAt);
  return uploaded !== null && now >= uploaded + PHOTO_LIFETIME;
}

function errorText(error) {
  if (error?.code === 'permission-denied') {
    return 'Firebase denied this operation. Check that the updated rules are published and you are signed in with an authorized email.';
  }
  if (error?.code === 'resource-exhausted') {
    return 'The Firebase usage limit has been reached. Please try again later.';
  }
  return error?.message || 'Something went wrong. Check your connection and try again.';
}

function ErrorNotice({ message }) {
  return message ? <p role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{message}</p> : null;
}

function useFrequentSuggestions(items, input) {
  return useMemo(() => {
    const counts = new Map();
    items.forEach(item => {
      const title = item.title?.trim();
      if (title) counts.set(title, (counts.get(title) || 0) + 1);
    });
    return [...counts.entries()]
      .filter(([title]) => title.toLowerCase().includes(input.toLowerCase()))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([title]) => title);
  }, [items, input]);
}

function SmartPills({ suggestions, onSelect, disabled }) {
  if (!suggestions.length) return null;
  return (
    <div className="flex gap-2 items-center overflow-x-auto py-1">
      <span className="text-xs font-bold text-gray-500">Frequent:</span>
      {suggestions.map(title => (
        <button key={title} type="button" disabled={disabled} onClick={() => onSelect(title)} className="shrink-0 text-xs font-bold px-2.5 py-1 bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 rounded-full">
          + {title}
        </button>
      ))}
    </div>
  );
}

// Browser-only processing: no full-resolution photo is uploaded.
async function decodePhoto(file) {
  if (typeof window.createImageBitmap === 'function') {
    try {
      return await window.createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Some browsers support more formats through an ordinary image element.
    }
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('This photo format cannot be opened by your browser. Try a JPEG, PNG, WebP or screenshot.'));
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
    if (!originalWidth || !originalHeight) throw new Error('The image is empty or unreadable.');
    const scale = Math.min(1, 1600 / Math.max(originalWidth, originalHeight));
    let width = Math.max(1, Math.round(originalWidth * scale));
    let height = Math.max(1, Math.round(originalHeight * scale));

    for (let attempt = 0; attempt < 10; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser cannot process images.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      for (const quality of [0.82, 0.68, 0.54, 0.4]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
        const bytes = Math.floor(encoded.length * 3 / 4) - padding;
        if (dataUrl.startsWith('data:image/jpeg;base64,') && bytes <= PHOTO_TARGET_BYTES && dataUrl.length <= PHOTO_TEXT_LIMIT) {
          return { dataUrl, bytes, width, height };
        }
      }
      width = Math.max(1, Math.floor(width * 0.75));
      height = Math.max(1, Math.floor(height * 0.75));
    }
    throw new Error('This image could not be reduced enough. Please choose a smaller image.');
  } finally {
    if (typeof image.close === 'function') image.close();
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
  const itemData = { ...data, createdAt: serverTimestamp() };
  if (photo) {
    const imageRef = doc(collection(db, 'attachments'));
    itemData.imageAttachmentId = imageRef.id;
    itemData.imageUploadedAt = serverTimestamp();
    batch.set(imageRef, attachmentData(collectionName, itemRef.id, photo));
  }
  batch.set(itemRef, itemData);
  await batch.commit();
}

async function replacePhoto(collectionName, itemId, photo) {
  const itemRef = doc(db, collectionName, itemId);
  const imageRef = doc(collection(db, 'attachments'));
  await runTransaction(db, async transaction => {
    const itemSnapshot = await transaction.get(itemRef);
    if (!itemSnapshot.exists()) throw new Error('This item was deleted. Refresh the list and try again.');
    const oldId = itemSnapshot.data().imageAttachmentId;
    transaction.set(imageRef, attachmentData(collectionName, itemId, photo));
    transaction.update(itemRef, {
      imageAttachmentId: imageRef.id,
      imageUploadedAt: serverTimestamp(),
      imageUrl: deleteField()
    });
    if (oldId) transaction.delete(doc(db, 'attachments', oldId));
  });
}

async function removePhoto(collectionName, itemId) {
  const itemRef = doc(db, collectionName, itemId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(itemRef);
    if (!snapshot.exists()) return;
    const oldId = snapshot.data().imageAttachmentId;
    if (oldId) transaction.delete(doc(db, 'attachments', oldId));
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
    if (imageId) transaction.delete(doc(db, 'attachments', imageId));
    transaction.delete(itemRef);
  });
}

async function toggleItem(collectionName, item) {
  const nextCompleted = !item.completed;
  await updateDoc(doc(db, collectionName, item.id), {
    completed: nextCompleted,
    completedAt: nextCompleted ? serverTimestamp() : null
  });
  if (collectionName === 'shopping_items' && item.listType === 'grocery' && nextCompleted && item.title?.trim()) {
    await addDoc(collection(db, 'grocery_history'), {
      title: item.title.trim(),
      store: item.storeSection || 'Prisma',
      quantity: Number(item.quantity) || 1,
      boughtAt: serverTimestamp()
    });
  }
}

async function cleanupExpiredPhotos() {
  const cutoff = Timestamp.fromMillis(Date.now() - PHOTO_LIFETIME);
  for (;;) {
    const result = await getDocs(query(
      collection(db, 'attachments'),
      where('uploadedAt', '<=', cutoff),
      orderBy('uploadedAt'),
      limit(25)
    ));
    if (result.empty) return;
    for (const candidate of result.docs) {
      await runTransaction(db, async transaction => {
        const image = await transaction.get(candidate.ref);
        if (!image.exists() || !photoExpired(image.data().uploadedAt)) return;
        const data = image.data();
        const validParent = ['tasks', 'shopping_items'].includes(data.itemCollection) && typeof data.itemId === 'string' && data.itemId && !data.itemId.includes('/');
        const itemRef = validParent ? doc(db, data.itemCollection, data.itemId) : null;
        const item = itemRef ? await transaction.get(itemRef) : null;
        transaction.delete(candidate.ref);
        if (item?.exists() && item.data().imageAttachmentId === image.id) {
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
        if (active) setError('Expired photos are hidden, but cleanup could not finish. Check your connection and the attachment rules. It will retry while the app is open.');
      } finally {
        running = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') clean();
    };
    clean();
    const timer = window.setInterval(clean, 10 * 60 * 1000);
    window.addEventListener('focus', clean);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', clean);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
  return error;
}

function PhotoDialog({ open, onClose, title, actions, children }) {
  const dialog = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const closeBackdrop = event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  };

  return (
    <dialog ref={dialog} onClose={onClose} onClick={closeBackdrop} aria-labelledby={titleId} className="fixed inset-0 m-auto w-[92vw] max-w-xl max-h-[85vh] p-0 border border-gray-200 bg-white text-[#1F2937] shadow-2xl backdrop:bg-black/60">
      <div className="flex items-center gap-2 p-3 border-b border-gray-200">
        <h3 id={titleId} className="flex-1 min-w-0 text-sm font-bold break-words">{title}</h3>
        {actions}
        <button type="button" onClick={onClose} title="Close photo" aria-label="Close photo" className={`${ICON_BUTTON_CLASS} text-gray-600`}><X className="w-4 h-4" /></button>
      </div>
      <div className="p-3 space-y-3">{children}</div>
    </dialog>
  );
}

function PhotoPicker({ photo, onChange, processing, onProcessing, disabled }) {
  const input = useRef(null);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  const label = processing ? 'Compressing photo...' : photo ? 'Change selected photo' : 'Add photo';
  const choose = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled || processing) return;
    setError('');
    onProcessing(true);
    try {
      onChange(await compressPhoto(file));
    } catch (err) {
      setError(errorText(err));
      setOpened(true);
    } finally {
      onProcessing(false);
    }
  };
  const clear = () => {
    onChange(null);
    setError('');
    setOpened(false);
  };
  return (
    <div className="shrink-0 flex items-center gap-1">
      <input ref={input} type="file" accept="image/*" onChange={choose} disabled={disabled || processing} className="hidden" />
      <button type="button" onClick={() => input.current?.click()} disabled={disabled || processing} title={label} aria-label={label} aria-busy={processing} className={`${ICON_BUTTON_CLASS} text-fuchsia-700`}>
        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
      </button>
      {photo && <button type="button" onClick={() => setOpened(true)} title="Preview selected photo" aria-label="Preview selected photo" className={`${ICON_BUTTON_CLASS} bg-fuchsia-50 text-fuchsia-700`}><ImageIcon className="w-4 h-4" /></button>}
      <PhotoDialog open={opened} onClose={() => setOpened(false)} title="Selected photo" actions={photo && <button type="button" onClick={clear} disabled={disabled || processing} title="Remove selected photo" aria-label="Remove selected photo" className={`${ICON_BUTTON_CLASS} text-red-600`}><Trash2 className="w-4 h-4" /></button>}>
        {photo && <><img src={photo.dataUrl} alt="Selected attachment preview" className="max-w-full max-h-[55vh] mx-auto object-contain" /><p className="text-xs text-gray-500">{photo.width} × {photo.height} · {Math.ceil(photo.bytes / 1024)} KB. Automatically compressed. Expires 14 days after saving.</p></>}
        <ErrorNotice message={error} />
      </PhotoDialog>
    </div>
  );
}

function PhotoAttachment({ item, collectionName, now, disabled = false }) {
  const input = useRef(null);
  const dialogInput = useRef(null);
  const [opened, setOpened] = useState(false);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const expired = photoExpired(item.imageUploadedAt, now);
  const freshImage = Boolean(image && image.id === item.imageAttachmentId && !photoExpired(image.uploadedAt, now));
  const legacyUrl = !item.imageAttachmentId && /^https?:\/\//i.test(item.imageUrl || '') ? item.imageUrl : null;
  const hasPhoto = Boolean(item.imageAttachmentId || legacyUrl);
  const available = hasPhoto && !expired;
  const label = busy ? 'Processing photo...' : available ? 'View photo' : expired ? 'Replace expired photo' : 'Add photo';

  useEffect(() => {
    let active = true;
    setImage(null);
    setLoadError('');
    setLoading(false);
    if (!opened || !item.imageAttachmentId || expired) return () => { active = false; };
    setLoading(true);
    getDoc(doc(db, 'attachments', item.imageAttachmentId))
      .then(snapshot => {
        if (!active) return;
        if (!snapshot.exists()) {
          setLoadError('This photo is no longer available.');
          return;
        }
        const data = snapshot.data();
        if (!photoExpired(data.uploadedAt) && /^data:image\/jpeg;base64,/.test(data.dataUrl || '')) {
          setImage({ id: snapshot.id, ...data });
        } else {
          setLoadError('This photo has expired.');
        }
      })
      .catch(err => { if (active) setLoadError(errorText(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [opened, item.imageAttachmentId, expired]);

  const choose = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy || disabled) return;
    setBusy(true);
    setError('');
    try {
      const photo = await compressPhoto(file);
      await replacePhoto(collectionName, item.id, photo);
      setOpened(true);
    } catch (err) {
      setError(errorText(err));
      setOpened(true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy || disabled || !window.confirm('Remove this photo? The item itself will stay.')) return;
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
    <div className="shrink-0 flex items-center">
      <input ref={input} type="file" accept="image/*" onChange={choose} disabled={busy || disabled} className="hidden" />
      <button type="button" disabled={busy || disabled} onClick={() => available ? setOpened(true) : input.current?.click()} title={label} aria-label={`${label}: ${item.title}`} aria-busy={busy} className={`${ICON_BUTTON_CLASS} ${available ? 'bg-fuchsia-50 text-fuchsia-700' : 'text-gray-500'}`}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : available ? <ImageIcon className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
      </button>
      <PhotoDialog open={opened} onClose={() => setOpened(false)} title={item.title} actions={<>
        <button type="button" disabled={busy || disabled} onClick={() => dialogInput.current?.click()} title={hasPhoto ? 'Replace photo' : 'Add photo'} aria-label={hasPhoto ? 'Replace photo' : 'Add photo'} className={`${ICON_BUTTON_CLASS} text-fuchsia-700`}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}</button>
        {hasPhoto && <button type="button" disabled={busy || disabled} onClick={remove} title="Remove photo" aria-label="Remove photo" className={`${ICON_BUTTON_CLASS} text-red-600`}><Trash2 className="w-4 h-4" /></button>}
      </>}>
        <input ref={dialogInput} type="file" accept="image/*" onChange={choose} disabled={busy || disabled} className="hidden" />
        {loading && <p role="status" className="text-xs text-gray-500">Loading photo...</p>}
        {busy && <p role="status" className="text-xs text-gray-500">Compressing and saving photo...</p>}
        {!expired && freshImage && <img src={image.dataUrl} alt={`Attachment for ${item.title}`} className="max-w-full max-h-[55vh] mx-auto object-contain" />}
        {!expired && legacyUrl && <a href={legacyUrl} target="_blank" rel="noopener noreferrer"><img src={legacyUrl} alt={`Attachment for ${item.title}`} className="max-w-full max-h-[55vh] mx-auto object-contain" /></a>}
        {expired && <p className="text-xs text-gray-500">This photo has expired. Use the camera button to add a new one.</p>}
        {!hasPhoto && !busy && <p className="text-xs text-gray-500">No photo attached. Use the camera button to add one.</p>}
        {available && <p className="text-xs text-gray-500">{legacyUrl ? 'External image: the 14-day cleanup applies only to new uploads.' : 'Uploaded photos expire 14 days after upload.'}</p>}
        <ErrorNotice message={error || loadError} />
      </PhotoDialog>
    </div>
  );
}

function hasReminder(item) {
  return ['calendar', 'morning', 'household', 'personal'].includes(item.scope) && [1, 7].includes(item.reminderDays);
}

function reminderTargetDate(item) {
  return item.scope === 'calendar' ? item.dueDate : item.reminderDate;
}

function reminderStartDate(item) {
  const target = reminderTargetDate(item);
  if (!hasReminder(item) || typeof target !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(target)) return null;
  const [year, month, day] = target.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (dateKey(date) !== target) return null;
  date.setDate(date.getDate() - item.reminderDays);
  return dateKey(date);
}

function reminderIsDue(item, today) {
  const starts = reminderStartDate(item);
  return Boolean(starts && starts <= today && !item.completed && (item.scope !== 'calendar' || !item.reminderDone));
}

function reminderLabel(days) {
  return days === 7 ? '1 week before' : '1 day before';
}

function ReminderCheckbox({ item, onError, disabled = false }) {
  const calendarEvent = item.scope === 'calendar';
  const checked = calendarEvent ? Boolean(item.reminderDone) : Boolean(item.completed);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const change = async event => {
    const done = event.target.checked;
    if (savingRef.current || disabled) return;
    savingRef.current = true;
    setSaving(true);
    onError('');
    try {
      await updateDoc(doc(db, 'tasks', item.id), calendarEvent ? {
        reminderDone: done,
        reminderDoneAt: done ? serverTimestamp() : null
      } : {
        completed: done,
        completedAt: done ? serverTimestamp() : null
      });
    } catch (err) {
      onError(errorText(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <label
      title={checked ? 'Done. Uncheck to enable it again.' : calendarEvent ? 'Mark reminder done for both household users' : 'Mark this task completed for both household users'}
      className={`shrink-0 min-h-[32px] inline-flex items-center gap-1.5 text-xs font-bold ${saving || disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={change}
        disabled={saving || disabled}
        aria-label={`${calendarEvent ? 'Reminder' : 'Task'} done: ${item.title}`}
        className="w-4 h-4 accent-fuchsia-600"
      />
      <span className="sr-only">{calendarEvent ? 'Reminder ' : 'Task '}</span>Done
    </label>
  );
}

function ReminderToasts({ tasks, now }) {
  const [dismissed, setDismissed] = useState(() => new Set());
  const [error, setError] = useState('');
  const today = dateKey(new Date(now));

  useEffect(() => {
    const reset = () => setDismissed(new Set());
    const visible = () => {
      if (document.visibilityState === 'visible') reset();
    };
    window.addEventListener('pageshow', reset);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('pageshow', reset);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  useEffect(() => { setDismissed(new Set()); }, [today]);

  const due = useMemo(() => tasks
    .filter(item => reminderIsDue(item, today))
    .sort((a, b) => reminderTargetDate(a).localeCompare(reminderTargetDate(b)) || a.id.localeCompare(b.id)), [tasks, today]);
  const visible = due.filter(item => !dismissed.has(item.id));
  const dismiss = id => setDismissed(previous => new Set([...previous, id]));
  const dismissAll = () => {
    setDismissed(previous => new Set([...previous, ...due.map(item => item.id)]));
    setError('');
  };

  if (!visible.length && !error) return null;

  return (
    <aside aria-label="Task and calendar reminders" className="fixed bottom-16 md:bottom-4 right-3 z-50 w-[calc(100vw-1.5rem)] max-w-sm rounded-lg border border-fuchsia-200 bg-white text-[#1F2937] shadow-xl">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-fuchsia-100">
        <Bell className="w-4 h-4 text-fuchsia-600" />
        <h2 className="flex-1 text-sm font-bold">Reminders ({visible.length})</h2>
        <button type="button" onClick={dismissAll} title="Dismiss reminders for now" aria-label="Dismiss reminders for now" className={ICON_BUTTON_CLASS}><X className="w-4 h-4" /></button>
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{visible.length} reminder{visible.length === 1 ? '' : 's'} need attention.</p>
      <div className="max-h-[35vh] overflow-y-auto overscroll-contain p-3 space-y-3">
        {visible.map(item => (
          <div key={item.id} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold [overflow-wrap:anywhere]">{item.title}</p>
              <p className="text-xs text-gray-500"><time dateTime={reminderTargetDate(item)}>{reminderTargetDate(item)}</time> · {reminderTargetDate(item) < today ? 'Past date — still pending' : reminderTargetDate(item) === today ? 'Today' : 'Upcoming'}</p>
              <p className="text-[11px] text-fuchsia-700">{item.scope === 'calendar' ? 'Calendar' : item.scope === 'personal' ? `Personal · ${item.owner || 'Shared'}` : item.scope === 'household' ? `Household · ${item.section || 'Shared'}` : 'Morning'}</p>
              <ReminderCheckbox item={item} onError={setError} />
            </div>
            <button type="button" onClick={() => dismiss(item.id)} title="Dismiss for now" aria-label={`Dismiss reminder for now: ${item.title}`} className={ICON_BUTTON_CLASS}><X className="w-4 h-4" /></button>
          </div>
        ))}
        <ErrorNotice message={error} />
      </div>
      <p className="px-3 pb-3 text-[11px] text-gray-500">Dismiss hides it for now. Check Done to stop reminders for both of you.</p>
    </aside>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('morning');
  const [personalOwner, setPersonalOwner] = useState('Johanna');
  const [tasks, setTasks] = useState([]);
  const [shoppingItems, setShoppingItems] = useState([]);
  const [groceryHistory, setGroceryHistory] = useState([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const email = user?.email?.toLowerCase() || '';
  const authorized = AUTHORIZED_EMAILS.includes(email);
  const cleanupError = usePhotoCleanup(Boolean(user && authorized));

  useEffect(() => onAuthStateChanged(auth, current => {
    setUser(current);
    setAuthLoading(false);
  }), []);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  useEffect(() => {
    setTasks([]);
    setShoppingItems([]);
    setGroceryHistory([]);
    setError('');
    if (!user || !authorized) return;
    const read = setter => snapshot => setter(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
    const failed = err => setError(errorText(err));
    const stopTasks = onSnapshot(collection(db, 'tasks'), read(setTasks), failed);
    const stopShopping = onSnapshot(collection(db, 'shopping_items'), read(setShoppingItems), failed);
    const stopHistory = onSnapshot(
      query(collection(db, 'grocery_history'), orderBy('boughtAt', 'desc'), limit(250)),
      read(setGroceryHistory),
      err => console.error('Grocery history read:', err)
    );
    return () => { stopTasks(); stopShopping(); stopHistory(); };
  }, [user, authorized]);

  const login = async () => {
    setError('');
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err) { setError(errorText(err)); }
  };
  const logout = async () => {
    try { await signOut(auth); }
    catch (err) { setError(errorText(err)); }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-[#F4F5F8] font-bold">Loading CHAOS CONTROL...</div>;
  if (!user || !authorized) {
    return (
      <div className="min-h-screen bg-[#F4F5F8] flex items-center justify-center p-4">
        <div className={`${PANEL_CLASS} max-w-md w-full text-center`}>
          <h1>
            <img
              src={`${import.meta.env.BASE_URL}cc-logo.png`}
              alt="CHAOS CONTROL"
              className="h-20 w-auto max-w-full object-contain mx-auto"
            />
          </h1>
          {user ? <><ShieldAlert className="w-10 h-10 mx-auto text-red-600" /><p>This account ({user.email}) is not one of the two authorized household accounts.</p></> : <p>Sign in with your authorized Google account.</p>}
          <ErrorNotice message={error} />
          <button onClick={user ? logout : login} className={`${BUTTON_CLASS} w-full`}>{user ? 'Sign out' : 'Sign in with Google'}</button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'morning', label: 'Morning', short: 'Morning', Icon: Sun },
    { id: 'household', label: 'Household To-Do', short: 'Home', Icon: Home },
    { id: 'personal', label: 'Personal To-Do', short: 'Personal', Icon: User },
    { id: 'calendar', label: 'Calendar', short: 'Calendar', Icon: Calendar },
    { id: 'grocery', label: 'Grocery List', short: 'Grocery', Icon: ShoppingCart },
    { id: 'other', label: 'Other Shopping', short: 'Other', Icon: ImageIcon }
  ];
  return (
    <div className="min-h-screen bg-[#F4F5F8] text-[#1F2937] font-sans pb-24 md:pb-6">
      <header className="bg-[#D946EF] text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-nowrap items-center gap-3">
          <h1 className="shrink-0">
            <img
              src={`${import.meta.env.BASE_URL}cc-logo.png`}
              alt="CHAOS CONTROL"
              className="h-10 w-auto max-w-[120px] object-contain"
            />
          </h1>

          <nav
            aria-label="Main navigation"
            className="hidden md:flex flex-1 min-w-0 flex-nowrap items-center gap-1 overflow-x-auto"
          >
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`shrink-0 min-h-[40px] px-2.5 lg:px-3 text-[11px] lg:text-xs font-black uppercase whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-fuchsia-600'
                    : 'hover:bg-fuchsia-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto shrink-0 flex items-center gap-2">
            <span
              title={user.displayName || user.email}
              className="hidden sm:block md:hidden xl:block max-w-[96px] truncate text-xs font-bold"
            >
              {user.displayName || user.email}
            </span>
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className="w-10 h-10 shrink-0 inline-flex items-center justify-center border border-white/30 hover:bg-fuchsia-600"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-4 space-y-3">
        <ErrorNotice message={error} /><ErrorNotice message={cleanupError} />
        {activeTab === 'morning' && <MorningToDoView user={user} tasks={tasks} now={now} />}
        {activeTab === 'household' && <HouseholdToDoView user={user} tasks={tasks} now={now} />}
        {activeTab === 'personal' && <PersonalToDoView user={user} tasks={tasks} now={now} owner={personalOwner} setOwner={setPersonalOwner} />}
        {activeTab === 'calendar' && <CalendarView user={user} tasks={tasks} now={now} />}
        {activeTab === 'grocery' && <ShoppingView key="grocery" listType="grocery" items={shoppingItems} groceryHistory={groceryHistory} now={now} />}
        {activeTab === 'other' && <ShoppingView key="other" listType="other" items={shoppingItems} now={now} />}
      </main>
      <ReminderToasts key={user.uid} tasks={tasks} now={now} />
      <nav className="fixed bottom-0 inset-x-0 bg-[#D946EF] text-white flex md:hidden z-40 p-1">
        {tabs.map(({ id, short, Icon }) => <button key={id} onClick={() => setActiveTab(id)} className={`flex-1 min-w-0 min-h-[48px] flex flex-col items-center justify-center ${activeTab === id ? 'bg-white text-fuchsia-600' : ''}`}><Icon className="w-5 h-5" /><span className="text-[9px] font-bold">{short}</span></button>)}
      </nav>
    </div>
  );
}

function TaskForm({ user, scope, owner = null, items }) {
  const [title, setTitle] = useState('');
  const [notifyDays, setNotifyDays] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [section, setSection] = useState('Kitchen');
  const [photo, setPhoto] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const suggestions = useFrequentSuggestions(items, title);
  const save = async event => {
    event.preventDefault();
    if (!title.trim() || saving || processing || (notifyDays && !reminderDate)) return;
    setSaving(true); setError('');
    try {
      const reminder = ['1', '7'].includes(notifyDays)
        ? { reminderDays: Number(notifyDays), reminderDate }
        : {};
      await createItem('tasks', {
        scope, owner, author: authorInitial(user), title: title.trim(),
        section: scope === 'household' ? section : null,
        completed: false, completedAt: null, ...reminder
      }, photo);
      setTitle(''); setPhoto(null); setNotifyDays(''); setReminderDate('');
    } catch (err) { setError(errorText(err)); }
    finally { setSaving(false); }
  };
  return (
    <form onSubmit={save} className={PANEL_CLASS}>
      <div className="flex flex-wrap items-end gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)} required disabled={saving} placeholder={scope === 'personal' ? `Add personal task for ${owner}...` : scope === 'morning' ? 'Add morning task...' : 'Write a quick task...'} className={`${INPUT_CLASS} flex-1 min-w-[140px] max-w-full`} />
        {scope === 'household' && <select value={section} onChange={e => setSection(e.target.value)} disabled={saving} className={INPUT_CLASS}>{ROOMS.map(room => <option key={room}>{room}</option>)}</select>}
        <label className="text-xs font-bold">Notify me
          <select value={notifyDays} onChange={e => setNotifyDays(e.target.value)} disabled={saving} className={`${INPUT_CLASS} block w-full mt-1`}>
            <option value="">-</option>
            <option value="1">1 day before</option>
            <option value="7">1 week before</option>
          </select>
        </label>
        {notifyDays && <label className="text-xs font-bold">Task date
          <input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)} required disabled={saving} className={`${INPUT_CLASS} block w-full mt-1`} />
        </label>}
        <PhotoPicker photo={photo} onChange={setPhoto} processing={processing} onProcessing={setProcessing} disabled={saving} />
        <button type="submit" disabled={saving || processing || !title.trim() || Boolean(notifyDays && !reminderDate)} className={BUTTON_CLASS}>{saving ? 'Saving...' : '+ Add task'}</button>
      </div>
      {scope !== 'personal' && <SmartPills suggestions={suggestions} onSelect={setTitle} disabled={saving} />}
      <ErrorNotice message={error} />
    </form>
  );
}

function AuthorBadge({ author }) {
  return <span title="Author" className="shrink-0 w-5 h-5 rounded-full bg-fuchsia-100 text-fuchsia-800 text-[10px] font-black inline-flex items-center justify-center">{author}</span>;
}

function ItemRow({ item, collectionName, now, shopping = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const perform = async action => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  const remove = () => {
    if (window.confirm(`Delete "${item.title}" and its uploaded photo?`)) perform(() => deleteItem(collectionName, item.id));
  };
  const changeQuantity = delta => perform(() => runTransaction(db, async transaction => {
    const ref = doc(db, collectionName, item.id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    transaction.update(ref, { quantity: Math.max(1, (Number(snapshot.data().quantity) || 1) + delta) });
  }));
  return (
    <div className="px-2 py-1 bg-gray-50 border border-gray-200">
      <div className="flex items-center gap-1 sm:gap-1.5">
        <button type="button" disabled={busy} onClick={() => perform(() => toggleItem(collectionName, item))} title={item.completed ? 'Mark incomplete' : 'Mark completed'} aria-label={`${item.completed ? 'Mark incomplete' : 'Mark completed'}: ${item.title}`} aria-pressed={Boolean(item.completed)} className={`${ICON_BUTTON_CLASS} border ${item.completed ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-300 text-gray-300'}`}><Check className="w-4 h-4" /></button>
        {item.author && <AuthorBadge author={item.author} />}
        <div className="flex-1 min-w-0 text-sm leading-snug [overflow-wrap:anywhere]">
          <span className={item.completed ? 'line-through text-gray-400' : 'font-bold'}>{item.title}</span>
          {item.section && <span className="ml-2 text-[10px] uppercase font-bold text-fuchsia-700">{item.section}</span>}
          {!shopping && hasReminder(item) && <span className="ml-2 text-[10px] font-bold text-fuchsia-700"><time dateTime={item.reminderDate}>{item.reminderDate}</time> · {reminderLabel(item.reminderDays)}</span>}
          {shopping && item.completed && <span className="ml-1 text-xs text-gray-400">×{item.quantity || 1}</span>}
        </div>
        {shopping && !item.completed && <div className="shrink-0 flex items-center border bg-white rounded"><button type="button" disabled={busy} onClick={() => changeQuantity(-1)} title="Decrease quantity" aria-label={`Decrease quantity: ${item.title}`} className="w-7 h-8 inline-flex items-center justify-center hover:bg-gray-100 disabled:opacity-50"><Minus className="w-3 h-3" /></button><span className="min-w-[1ch] text-center text-xs font-bold">{item.quantity || 1}</span><button type="button" disabled={busy} onClick={() => changeQuantity(1)} title="Increase quantity" aria-label={`Increase quantity: ${item.title}`} className="w-7 h-8 inline-flex items-center justify-center hover:bg-gray-100 disabled:opacity-50"><Plus className="w-3 h-3" /></button></div>}
        <PhotoAttachment item={item} collectionName={collectionName} now={now} disabled={busy} />
        <button type="button" disabled={busy} onClick={remove} title="Delete item" aria-label={`Delete item: ${item.title}`} className={`${ICON_BUTTON_CLASS} text-red-600`}><Trash2 className="w-4 h-4" /></button>
      </div>
      <ErrorNotice message={error} />
    </div>
  );
}

function TaskList({ items, now, empty = 'Nothing pending.' }) {
  return items.length ? <div className="space-y-2">{items.map(item => <ItemRow key={item.id} item={item} collectionName="tasks" now={now} />)}</div> : <p className="text-xs text-gray-400 italic">{empty}</p>;
}

function MorningToDoView({ user, tasks, now }) {
  const items = useMemo(() => tasks.filter(item => item.scope === 'morning'), [tasks]);
  const active = items.filter(item => !item.completed);
  const completed = items.filter(item => item.completed);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-black uppercase flex gap-2 items-center"><Sun className="w-5 h-5 text-amber-500" />Morning Checklist</h2>
      <TaskForm user={user} scope="morning" items={items} />
      <section className={PANEL_CLASS}><h3 className="text-xs font-black uppercase">Active Morning Routine ({active.length})</h3><TaskList items={active} now={now} empty="Morning routine complete!" /></section>
      {completed.length > 0 && <section className={PANEL_CLASS}><h3 className="text-xs font-black uppercase text-gray-500">Completed ({completed.length})</h3><TaskList items={completed} now={now} /></section>}
    </div>
  );
}

function HouseholdToDoView({ user, tasks, now }) {
  const [months, setMonths] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const items = useMemo(() => tasks.filter(item => item.scope === 'household'), [tasks]);
  const active = items.filter(item => !item.completed);
  const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - months);
  const completed = items.filter(item => item.completed && (!item.completedAt || timeMillis(item.completedAt) >= cutoff.getTime()));
  return (
    <div className="space-y-4">
      <TaskForm user={user} scope="household" items={items} />
      <div className="grid md:grid-cols-2 gap-4">{ROOMS.map(room => {
        const roomTasks = active.filter(item => item.section === room);
        return <section key={room} className={PANEL_CLASS}><h3 className="text-sm font-black uppercase border-b pb-2">{room} ({roomTasks.length})</h3><TaskList items={roomTasks} now={now} empty="Empty list." /></section>;
      })}</div>
      <section className={PANEL_CLASS}>
        <button onClick={() => setExpanded(!expanded)} className="w-full min-h-[40px] flex justify-between items-center text-xs font-black uppercase">Completed Tasks ({completed.length}){expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}</button>
        {expanded && <><p className="text-xs text-gray-500">Showing the past {months} month{months > 1 ? 's' : ''}.</p><TaskList items={completed} now={now} empty="No completed tasks in range." />{months < 12 && <button onClick={() => setMonths(value => Math.min(value + 1, 12))} className={BUTTON_CLASS}>Show 1 month more</button>}</>}
      </section>
    </div>
  );
}

function PersonalToDoView({ user, tasks, now, owner, setOwner }) {
  const items = useMemo(() => tasks.filter(item => item.scope === 'personal' && item.owner === owner), [tasks, owner]);
  const active = items.filter(item => !item.completed);
  const completed = items.filter(item => item.completed);
  return (
    <div className="space-y-4">
      <div className={`${PANEL_CLASS} flex flex-wrap items-center gap-2`}><span className="text-xs font-bold">List Owner:</span>{['Johanna', 'Otto'].map(name => <button key={name} onClick={() => setOwner(name)} className={`min-h-[40px] px-5 text-xs font-black uppercase ${owner === name ? 'bg-fuchsia-500 text-white' : 'bg-gray-100'}`}>{name}</button>)}</div>
      <TaskForm key={owner} user={user} scope="personal" owner={owner} items={items} />
      <section className={PANEL_CLASS}><h3 className="text-xs font-black uppercase">{owner}'s Pending Tasks ({active.length})</h3><TaskList items={active} now={now} /></section>
      {completed.length > 0 && <section className={PANEL_CLASS}><h3 className="text-xs font-black uppercase text-gray-500">Completed ({completed.length})</h3><TaskList items={completed} now={now} /></section>}
    </div>
  );
}

function CalendarView({ user, tasks, now }) {
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [notifyDays, setNotifyDays] = useState('');
  const [photo, setPhoto] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [today, setToday] = useState(() => dateKey(new Date()));

  useEffect(() => {
    let timer;
    const refresh = () => {
      const current = new Date();
      setToday(dateKey(current));
      const midnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, midnight.getTime() - current.getTime() + 100);
    };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);

  const pastStart = useMemo(() => {
    const [year, month, day] = today.split('-').map(Number);
    return dateKey(new Date(year, month - 2, Math.min(day, new Date(year, month - 1, 0).getDate())));
  }, [today]);
  const items = useMemo(() => tasks.filter(item => !item.completed && typeof item.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) && item.dueDate >= (showPast ? pastStart : today)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [tasks, showPast, pastStart, today]);
  const relativeDay = value => {
    const [y, m, d] = value.split('-').map(Number);
    const [ty, tm, td] = today.split('-').map(Number);
    const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
    return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === -1 ? 'Yesterday' : days > 1 ? `In ${days} days` : `${Math.abs(days)} days ago`;
  };
  const save = async event => {
    event.preventDefault();
    if (!title.trim() || !eventDate || saving || processing) return;
    setSaving(true); setError('');
    try {
      const reminder = ['1', '7'].includes(notifyDays)
        ? { reminderDays: Number(notifyDays), reminderDone: false, reminderDoneAt: null }
        : {};
      await createItem('tasks', { scope: 'calendar', owner: null, author: authorInitial(user), title: title.trim(), dueDate: eventDate, completed: false, completedAt: null, ...reminder }, photo);
      setTitle(''); setEventDate(''); setPhoto(null); setNotifyDays('');
    } catch (err) { setError(errorText(err)); }
    finally { setSaving(false); }
  };
  const remove = async item => {
    if (deletingId || !window.confirm(`Delete the event "${item.title}" and its uploaded photo?`)) return;
    setDeletingId(item.id); setError('');
    try { await deleteItem('tasks', item.id); }
    catch (err) { setError(errorText(err)); }
    finally { setDeletingId(null); }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center"><h2 className="text-lg font-black uppercase flex items-center gap-2"><Calendar className="w-5 h-5 text-fuchsia-600" />Calendar</h2><span className="text-xs font-bold">{items.length} shown</span></div>
      <form onSubmit={save} className={PANEL_CLASS}>
        <h3 className="text-xs font-black uppercase text-fuchsia-600">Add an event</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[160px] text-xs font-bold">Event<input value={title} onChange={e => setTitle(e.target.value)} required disabled={saving} placeholder="e.g. Dentist appointment" className={`${INPUT_CLASS} block w-full mt-1`} /></label>
          <label className="text-xs font-bold">Date<input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} required disabled={saving} className={`${INPUT_CLASS} block w-full mt-1`} /></label>
          <label className="text-xs font-bold">Notify me
            <select value={notifyDays} onChange={e => setNotifyDays(e.target.value)} disabled={saving} className={`${INPUT_CLASS} block w-full mt-1`}>
              <option value="">-</option>
              <option value="1">1 day before</option>
              <option value="7">1 week before</option>
            </select>
          </label>
          <PhotoPicker photo={photo} onChange={setPhoto} processing={processing} onProcessing={setProcessing} disabled={saving} />
          <button type="submit" disabled={saving || processing || !title.trim() || !eventDate} className={BUTTON_CLASS}>{saving ? 'Saving...' : '+ Add event'}</button>
        </div>
      </form>
      <ErrorNotice message={error} />
      <div className={PANEL_CLASS}><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} className="w-4 h-4 accent-fuchsia-600" />Show past events</label><p className="text-xs text-gray-500">{showPast ? `Showing today and future events, plus past events from ${pastStart} through yesterday.` : 'Showing today and future events. Turn this on to also see the past month.'}</p></div>
      {items.length === 0 ? <div className={`${PANEL_CLASS} text-center text-sm text-gray-500`}>{showPast ? 'No events in this date range.' : 'No upcoming events.'}</div> : <div className={PANEL_CLASS}>{items.map(item => (
        <article key={item.id} className="px-2 py-1 border border-gray-200 bg-gray-50 flex items-center gap-1.5">
          <AuthorBadge author={item.author || item.owner?.charAt(0) || 'H'} />
          <div className="flex-1 min-w-0 text-sm leading-snug [overflow-wrap:anywhere]">
            <h3 className="inline font-bold">{item.title}</h3>{' '}
            <span className="text-xs text-gray-500"><time dateTime={item.dueDate}>{item.dueDate}</time> · {relativeDay(item.dueDate)}{item.scope !== 'calendar' && ' · Existing dated task'}</span>
            {hasReminder(item) && <span className={`ml-2 text-[10px] font-bold ${item.reminderDone ? 'text-emerald-700' : 'text-fuchsia-700'}`}>{item.reminderDone ? 'Reminder done' : `Notify: ${reminderLabel(item.reminderDays)}`}</span>}
          </div>
          {hasReminder(item) && <ReminderCheckbox item={item} onError={setError} disabled={Boolean(deletingId)} />}
          <PhotoAttachment item={item} collectionName="tasks" now={now} disabled={Boolean(deletingId)} />
          {item.scope === 'calendar' && <button type="button" disabled={Boolean(deletingId)} onClick={() => remove(item)} title="Delete event" aria-label={`Delete event: ${item.title}`} className={`${ICON_BUTTON_CLASS} text-red-600`}><Trash2 className="w-4 h-4" /></button>}
        </article>
      ))}</div>}
    </div>
  );
}

// Only a public Worker URL is stored here. The Gemini key stays in Cloudflare.
async function requestGrocerySuggestions() {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in before asking for AI suggestions.');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 100000);
  try {
    // Firebase automatically refreshes an expired token. Retry one 401 with a
    // forced refresh; never retry quota or provider errors automatically.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (auth.currentUser?.uid !== user.uid) throw new Error('Your sign-in changed. Please try again.');
      const token = await user.getIdToken(attempt === 1);
      const response = await fetch(AI_ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({}),
        signal: controller.signal
      });
      if (response.status === 401 && attempt === 0) {
        await response.body?.cancel();
        continue;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message || `The AI service returned an error (${response.status}). Check the Cloudflare setup.`);
      }
      if (!Array.isArray(payload?.suggestions)) {
        throw new Error('The Worker did not return suggestions. Make sure the supplied Worker code is deployed, not the Hello World starter.');
      }
      return payload;
    }
    throw new Error('Please sign out and sign in again to use AI suggestions.');
  } catch (err) {
    if (controller.signal.aborted) throw new Error('The AI request timed out. Wait one minute before trying again.');
    if (err instanceof TypeError) throw new Error('Could not reach the AI Worker. Check your connection, the deployed Worker code and its ALLOWED_ORIGIN setting.');
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}

function GroceryAiAdvisor({ groceryHistory, activeGroceryItems, onAddItem }) {
  const [suggestions, setSuggestions] = useState([]);
  const [addedIds, setAddedIds] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestPending = useRef(false);
  const addingIds = useRef(new Set());
  const [adding, setAdding] = useState(() => new Set());
  const [sources, setSources] = useState([]);
  const [searchEntryPoint, setSearchEntryPoint] = useState('');

  const fetchSuggestions = async () => {
    if (requestPending.current || addingIds.current.size) return;
    requestPending.current = true;
    setLoading(true);
    setError('');
    setSuggestions([]);
    setSources([]);
    setSearchEntryPoint('');
    setAddedIds(new Set());
    try {
      // Send only the existing Firebase sign-in token to the Worker.
      // The Worker reads the grocery data and calls Gemini privately.
      const data = await requestGrocerySuggestions();
      if (!Array.isArray(data?.suggestions)) throw new Error('AI returned an unexpected response.');
      setSuggestions(data.suggestions.map((item, idx) => ({ ...item, id: `${Date.now()}-${idx}` })));
      setSources(Array.isArray(data.sources) ? data.sources.filter(source => {
        try { const url = new URL(source.url); return url.protocol === 'https:' && !url.username && !url.password; }
        catch { return false; }
      }) : []);
      setSearchEntryPoint(typeof data.searchEntryPoint === 'string' ? data.searchEntryPoint : '');
    } catch (err) {
      setError(err?.message || 'Could not get AI suggestions. Try again later.');
    } finally {
      requestPending.current = false;
      setLoading(false);
    }
  };

  const handleAddSingle = async suggestion => {
    if (loading || addedIds.has(suggestion.id) || addingIds.current.has(suggestion.id)) return;
    const targetColumn = suggestion.store === 'Lidl' ? 'Lidl' : 'Prisma';
    const displayTitle = ['Prisma', 'Lidl'].includes(suggestion.store)
      ? suggestion.title
      : `${suggestion.title} (${suggestion.store})`;
    const normalized = displayTitle.trim().toLocaleLowerCase('fi-FI');
    if (activeGroceryItems.some(item => !item.completed && item.title?.trim().toLocaleLowerCase('fi-FI') === normalized)) {
      setAddedIds(previous => new Set([...previous, suggestion.id]));
      return;
    }
    addingIds.current.add(suggestion.id);
    setAdding(new Set(addingIds.current));
    setError('');
    try {
      await onAddItem(displayTitle, targetColumn, suggestion.quantity);
      setAddedIds(previous => new Set([...previous, suggestion.id]));
    } catch (err) {
      setError(errorText(err));
    } finally {
      addingIds.current.delete(suggestion.id);
      setAdding(new Set(addingIds.current));
    }
  };

  return (
    <section className={PANEL_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-black uppercase text-fuchsia-700 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            Smart Deals &amp; Habit Suggestions
          </h3>
          <p className="text-[11px] text-gray-500">
            Uses up to {groceryHistory.length} recent logged purchases to suggest restocks and check Lidl, Prisma, K-Market &amp; Citymarket offers.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchSuggestions}
          disabled={loading || adding.size > 0}
          className={`${BUTTON_CLASS} inline-flex items-center gap-1.5`}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'Checking offers...' : 'Suggest 5–10 Items'}
        </button>
      </div>

      <p className="text-[11px] text-gray-500">On request, purchase-frequency summaries and active grocery names are sent to Google Gemini. Verify offers with the store; prices and availability may vary.</p>
      <ErrorNotice message={error} />

      {suggestions.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-2 pt-1">
          {suggestions.map(item => {
            const added = addedIds.has(item.id);
            return (
              <div key={item.id} className="p-2.5 bg-fuchsia-50/60 border border-fuchsia-200 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-sm text-[#1F2937]">{item.title}</span>
                    <span className="text-[10px] font-black uppercase px-1.5 py-0.5 bg-white border border-fuchsia-200 text-fuchsia-700">
                      {item.store}
                    </span>
                  </div>
                  {item.habitReason && (
                    <p className="text-[11px] font-semibold text-gray-600 mt-0.5">📊 {item.habitReason}</p>
                  )}
                  {item.dealReason && (
                    <p className="text-[11px] font-semibold text-emerald-700">🏷️ {item.dealReason}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={added || adding.has(item.id) || loading}
                  onClick={() => handleAddSingle(item)}
                  className={`shrink-0 min-h-[36px] px-3 text-xs font-black uppercase border ${
                    added
                      ? 'bg-emerald-600 border-emerald-600 text-white cursor-default'
                      : 'bg-white border-fuchsia-300 text-fuchsia-700 hover:bg-fuchsia-600 hover:text-white'
                  }`}
                >
                  {added ? 'Added ✓' : adding.has(item.id) ? 'Adding...' : '+ Add'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {sources.length > 0 && <div className="border-t pt-2 text-xs space-y-1">
        <p className="font-bold">Search sources — check offers before shopping</p>
        <ul className="list-disc pl-4 space-y-1">{sources.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-fuchsia-700 underline break-words">{source.title || 'View source'}</a></li>)}</ul>
      </div>}
      {searchEntryPoint && <iframe
        title="Google Search suggestions"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="w-full h-40 border-0"
        srcDoc={`<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none';"><base target="_blank"></head><body>${searchEntryPoint}</body></html>`}
      />}
    </section>
  );
}

function ShoppingView({ listType, items, groceryHistory = [], now }) {
  const storeGroupName = useId();
  const [title, setTitle] = useState('');
  const [store, setStore] = useState('Prisma');
  const [quantity, setQuantity] = useState(1);
  const [photo, setPhoto] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const grocery = listType === 'grocery';
  const list = useMemo(() => items.filter(item => item.listType === listType), [items, listType]);
  const suggestions = useFrequentSuggestions(list, title);
  const save = async event => {
    event.preventDefault();
    if (!title.trim() || saving || processing) return;
    setSaving(true); setError('');
    try {
      await createItem('shopping_items', { listType, storeSection: grocery ? store : 'general', title: title.trim(), quantity, completed: false, completedAt: null }, photo);
      setTitle(''); setQuantity(1); setPhoto(null);
    } catch (err) { setError(errorText(err)); }
    finally { setSaving(false); }
  };
  const addFromAi = async (itemTitle, targetStore, itemQty) => {
    // Let the advisor show write failures; never mark an unsaved item as Added.
    await createItem('shopping_items', {
      listType: 'grocery', storeSection: targetStore, title: itemTitle,
      quantity: itemQty, completed: false, completedAt: null
    }, null);
  };
  const groups = grocery ? ['Prisma', 'Lidl'] : ['General Items'];
  return (
    <div className="space-y-4">
      {grocery && (
        <GroceryAiAdvisor
          groceryHistory={groceryHistory}
          activeGroceryItems={list}
          onAddItem={addFromAi}
        />
      )}
      <form onSubmit={save} className={PANEL_CLASS}>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={title} onChange={e => setTitle(e.target.value)} required disabled={saving} placeholder={grocery ? 'e.g. Milk, Bananas...' : 'e.g. Batteries, Lightbulbs...'} className={`${INPUT_CLASS} flex-1 min-w-0`} />
          <div className="flex flex-wrap items-center gap-2">
            {grocery && (
              <fieldset disabled={saving} className="flex gap-1">
                <legend className="sr-only">Grocery store</legend>
                {['Prisma', 'Lidl'].map(name => (
                  <label key={name} className={`min-h-[44px] px-3 inline-flex items-center gap-2 border text-xs font-bold cursor-pointer ${store === name ? 'border-fuchsia-400 bg-fuchsia-50 text-fuchsia-800' : 'border-gray-300 bg-gray-50'} ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input type="radio" name={storeGroupName} value={name} checked={store === name} onChange={e => setStore(e.target.value)} className="w-4 h-4 accent-fuchsia-600" />
                    {name}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="flex items-center border bg-gray-50"><button type="button" disabled={saving} onClick={() => setQuantity(value => Math.max(1, value - 1))} aria-label="Decrease quantity" className="min-w-[36px] min-h-[44px]">-</button><span className="text-sm font-bold">{quantity}</span><button type="button" disabled={saving} onClick={() => setQuantity(value => value + 1)} aria-label="Increase quantity" className="min-w-[36px] min-h-[44px]">+</button></div>
            <PhotoPicker photo={photo} onChange={setPhoto} processing={processing} onProcessing={setProcessing} disabled={saving} />
            <button type="submit" disabled={saving || processing || !title.trim()} className={BUTTON_CLASS}>{saving ? 'Saving...' : '+ Add'}</button>
          </div>
        </div>
        {grocery && <SmartPills suggestions={suggestions} onSelect={setTitle} disabled={saving} />}
        <ErrorNotice message={error} />
      </form>
      <div className={grocery ? 'grid md:grid-cols-2 gap-4' : 'space-y-4'}>{groups.map(group => {
        const groupItems = grocery ? list.filter(item => item.storeSection === group) : list;
        const active = groupItems.filter(item => !item.completed);
        const completed = groupItems.filter(item => item.completed);
        return <section key={group} className={PANEL_CLASS}><h3 className="text-sm font-black uppercase border-b pb-2">{group} ({active.length})</h3>{active.length ? active.map(item => <ItemRow key={item.id} item={item} collectionName="shopping_items" now={now} shopping />) : <p className="text-xs text-gray-400 italic">No items needed.</p>}{completed.length > 0 && <div className="pt-3 border-t space-y-2"><h4 className="text-[10px] uppercase font-black text-gray-500">Purchased ({completed.length})</h4>{completed.map(item => <ItemRow key={item.id} item={item} collectionName="shopping_items" now={now} shopping />)}</div>}</section>;
      })}</div>
    </div>
  );
}
