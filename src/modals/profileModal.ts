import { db } from '../db/database';
import type { LocalProfile } from '../db/database';
import {
  CURRENT_APP_VERSION,
  displayVersion,
  isNewerVersion,
} from '../services/appUpdater';
import type { AppRelease } from '../services/appUpdater';

interface ProfileModalOptions {
  profile: LocalProfile;
  demoModeEnabled: boolean;
  latestRelease: AppRelease | null;
  onSave: (profile: LocalProfile) => Promise<void>;
  onDemoModeChange: (enabled: boolean) => void;
  onLoadSampleData: () => Promise<void>;
  onViewTerms: () => void;
  onToast: (message: string, type?: 'success' | 'warning' | 'alert') => void;
  onClose: () => void;
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export function getProfileInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export async function openProfileModal(options: ProfileModalOptions): Promise<void> {
  const backdrop = document.getElementById('modal-backdrop');
  const modalBody = document.getElementById('modal-body');
  if (!backdrop || !modalBody) return;

  const currentProfile = options.profile;
  const updateAvailable = Boolean(
    options.latestRelease &&
    isNewerVersion(options.latestRelease.version, CURRENT_APP_VERSION)
  );
  const latestVersion = options.latestRelease
    ? displayVersion(options.latestRelease.version)
    : '';
  document.getElementById('modal-title')!.textContent = 'Patient Profile';
  document.getElementById('modal-subtitle')!.textContent = 'Private and stored on this device';

  modalBody.innerHTML = `
    <form id="profile-modal-form" class="space-y-4">
      <div class="flex flex-col items-center">
        <button id="profile-photo-button" type="button" class="relative h-24 w-24 rounded-full border-4 border-white bg-slate-100 shadow-md ring-1 ring-slate-200 overflow-visible">
          <span id="profile-photo-preview" class="flex h-full w-full items-center justify-center overflow-hidden rounded-full"></span>
          <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-teal-600 px-3 py-1 text-[10px] font-black text-white shadow">Change Photo</span>
        </button>
        <input id="profile-photo-input" type="file" accept="image/*" class="hidden" />
        <p class="mt-4 text-[10px] font-medium text-slate-500">Photo, age, and sex never leave this device.</p>
      </div>

      <div>
        <label for="profile-name" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-900">Name</label>
        <input id="profile-name" type="text" maxlength="80" value="${escapeHtml(currentProfile.name)}" placeholder="Your name" class="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/20" />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label for="profile-age" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-900">Age <span class="font-medium text-slate-400">(optional)</span></label>
          <input id="profile-age" type="number" min="1" max="150" inputmode="numeric" value="${currentProfile.age ?? ''}" placeholder="Age" class="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/20" />
        </div>
        <div>
          <label for="profile-sex" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-900">Sex</label>
          <select id="profile-sex" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/20">
            <option>Prefer not to say</option>
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
        </div>
      </div>

      <div class="overflow-hidden rounded-xl border ${updateAvailable ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-slate-50'}">
        <button id="profile-version-row" type="button" class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <span>
            <span class="block text-xs font-bold text-slate-900">App Version</span>
            <span class="mt-0.5 block text-[10px] text-slate-500">Current: ${escapeHtml(displayVersion(CURRENT_APP_VERSION))}</span>
          </span>
          ${updateAvailable ? `
            <span class="text-right">
              <span class="inline-flex rounded-full bg-teal-600 px-2 py-1 text-[9px] font-black text-white">UPDATE</span>
              <span class="mt-1 block text-[10px] font-black text-teal-800">Latest: ${escapeHtml(latestVersion)} (Tap to Update)</span>
            </span>
          ` : `
            <span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700">
              <span aria-hidden="true">✓</span> Latest version
            </span>
          `}
        </button>
        ${updateAvailable ? `
          <div class="border-t border-teal-200 px-3 py-2">
            <button id="install-app-update" type="button" class="w-full rounded-lg bg-teal-600 px-3 py-2.5 text-xs font-bold text-white">Update to ${escapeHtml(latestVersion)}</button>
          </div>
        ` : `
          <div class="border-t border-slate-200 px-3 py-2">
            <button type="button" disabled class="w-full cursor-not-allowed rounded-lg bg-slate-200 px-3 py-2.5 text-xs font-bold text-slate-500">✓ Your version is up to date</button>
          </div>
        `}
      </div>
      <div id="demo-pin-panel" class="hidden rounded-xl border border-teal-200 bg-teal-50 p-3">
        <label for="demo-pin-input" class="mb-2 block text-xs font-black text-teal-900">Enter 4-digit demo PIN</label>
        <div class="flex gap-2">
          <input id="demo-pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" class="min-w-0 flex-1 rounded-lg border border-teal-300 bg-white px-3 py-2.5 text-center text-sm font-black tracking-[0.5em] text-slate-900 focus:border-teal-500 focus:outline-none" />
          <button id="demo-pin-submit" type="button" class="rounded-lg bg-teal-600 px-4 text-xs font-bold text-white">Unlock</button>
        </div>
      </div>

      <div id="profile-demo-actions" class="${options.demoModeEnabled ? '' : 'hidden'} space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p class="text-[10px] font-black uppercase tracking-wider text-amber-800">Developer Demo Mode Active</p>
        <button id="load-sample-data" type="button" class="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-bold text-white">Load Sample Data</button>
        <button id="turn-off-demo-mode" type="button" class="w-full rounded-lg bg-white px-4 py-2.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">Turn Off Demo Mode</button>
      </div>

      <button id="view-terms-button" type="button" class="w-full py-1 text-center text-[11px] font-bold text-slate-500 underline decoration-slate-300 underline-offset-4">View Terms of Use &amp; Medical Disclaimer</button>

      <div class="flex gap-2 pt-1">
        <button type="submit" class="flex-1 rounded-lg bg-teal-600 py-3 text-xs font-bold text-white shadow-lg shadow-teal-500/20">Save Profile</button>
        <button id="profile-cancel" type="button" class="flex-1 rounded-lg bg-slate-100 py-3 text-xs font-bold text-slate-700">Cancel</button>
      </div>
    </form>
  `;

  let pendingPhoto = currentProfile.photo;
  let versionTapTimes: number[] = [];
  let updatePromptTimer: number | null = null;
  const preview = document.getElementById('profile-photo-preview')!;
  const photoInput = document.getElementById('profile-photo-input') as HTMLInputElement;
  const sexInput = document.getElementById('profile-sex') as HTMLSelectElement;
  sexInput.value = currentProfile.sex;

  const updatePhotoPreview = () => {
    const name = (document.getElementById('profile-name') as HTMLInputElement).value;
    const initials = getProfileInitials(name);
    preview.innerHTML = pendingPhoto
      ? `<img src="${escapeHtml(pendingPhoto)}" alt="Profile photo" class="h-24 w-24 rounded-full object-cover" />`
      : `<span class="flex h-full w-full items-center justify-center rounded-full bg-teal-100 text-xl font-black text-teal-700">${initials || '<svg aria-hidden="true" class="h-9 w-9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/></svg>'}</span>`;
  };
  updatePhotoPreview();

  document.getElementById('profile-name')!.addEventListener('input', updatePhotoPreview);
  document.getElementById('profile-photo-button')!.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    try {
      pendingPhoto = await resizeProfilePhoto(file);
      updatePhotoPreview();
    } catch (error) {
      console.error('Unable to prepare profile photo', error);
      options.onToast('Unable to use that photo', 'warning');
    }
  });

  const promptForAppUpdate = () => {
    if (!options.latestRelease || !updateAvailable) return;
    const confirmed = window.confirm(
      `A new version (${latestVersion}) is available. Download and install now? Your local medications and vitals will stay safe.`
    );
    if (confirmed) {
      window.open(options.latestRelease.apk_url, '_blank', 'noopener,noreferrer');
    }
  };

  document.getElementById('profile-version-row')!.addEventListener('click', () => {
    const now = Date.now();
    versionTapTimes = [...versionTapTimes.filter((timestamp) => now - timestamp <= 4000), now];
    if (updatePromptTimer !== null) window.clearTimeout(updatePromptTimer);
    if (versionTapTimes.length < 7) {
      if (updateAvailable) {
        updatePromptTimer = window.setTimeout(() => {
          if (versionTapTimes.length < 7) promptForAppUpdate();
          updatePromptTimer = null;
        }, 450);
      }
      return;
    }
    versionTapTimes = [];
    const pinPanel = document.getElementById('demo-pin-panel')!;
    pinPanel.classList.remove('hidden');
    (document.getElementById('demo-pin-input') as HTMLInputElement).focus();
    return;
  });

  if (updateAvailable) {
    document.getElementById('install-app-update')!.addEventListener('click', promptForAppUpdate);
  }

  document.getElementById('demo-pin-submit')!.addEventListener('click', () => {
    const pin = (document.getElementById('demo-pin-input') as HTMLInputElement).value;
    const expectedPin = import.meta.env.VITE_DEMO_PIN || '1984';
    if (pin !== expectedPin) {
      options.onToast('Incorrect demo PIN', 'warning');
      return;
    }
    options.onDemoModeChange(true);
    document.getElementById('demo-pin-panel')!.classList.add('hidden');
    document.getElementById('profile-demo-actions')!.classList.remove('hidden');
    options.onToast('🔓 Developer Demo Mode Unlocked');
  });

  document.getElementById('load-sample-data')!.addEventListener('click', async () => {
    try {
      await options.onLoadSampleData();
    } catch (error) {
      console.error('Unable to load sample demo data', error);
      options.onToast('Unable to load sample data', 'alert');
    }
  });
  document.getElementById('turn-off-demo-mode')!.addEventListener('click', () => {
    options.onDemoModeChange(false);
    document.getElementById('profile-demo-actions')!.classList.add('hidden');
    options.onToast('Demo Mode turned off');
  });
  document.getElementById('view-terms-button')!.addEventListener('click', options.onViewTerms);

  document.getElementById('profile-cancel')!.addEventListener('click', options.onClose);
  document.getElementById('profile-modal-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const ageValue = (document.getElementById('profile-age') as HTMLInputElement).value;
    const parsedAge = ageValue ? Number(ageValue) : null;
    const profile: LocalProfile = {
      name: (document.getElementById('profile-name') as HTMLInputElement).value.trim().slice(0, 80),
      age: parsedAge !== null && Number.isInteger(parsedAge) && parsedAge > 0 && parsedAge <= 150
        ? parsedAge
        : null,
      sex: sexInput.value as LocalProfile['sex'],
      photo: pendingPhoto,
    };

    try {
      await db.saveLocalProfile(profile);
      await options.onSave(profile);
      options.onClose();
      options.onToast(`✓ Saved profile${profile.name ? ` for ${profile.name}` : ''}`);
    } catch (error) {
      console.error('Unable to save local profile', error);
      options.onToast('Unable to save profile on this device', 'alert');
    }
  });

  backdrop.classList.remove('hidden');
}

function resizeProfilePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selected file is not an image'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Unable to read photo'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Unable to decode photo'));
      image.onload = () => {
        const scale = Math.min(1, 300 / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Canvas is unavailable'));
          return;
        }
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
