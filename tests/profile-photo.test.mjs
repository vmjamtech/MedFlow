import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadProfileModal() {
  const mocks = {
    '@capacitor/core': "export const Capacitor = { getPlatform: () => 'android' };",
    '@capacitor/camera': "export const Camera = {}; export const CameraResultType = { DataUrl: 'dataUrl' }; export const CameraSource = { Photos: 'PHOTOS' };",
    '../db/database': 'export const db = {};',
    '../services/appUpdater': "export const CURRENT_APP_VERSION = '1.0.0'; export const displayVersion = (value) => value; export const isNewerVersion = () => false;",
  };
  const result = await build({
    stdin: {
      contents: "export { openProfileModal } from './src/modals/profileModal.ts'; export { Camera } from '@capacitor/camera'; export { db } from '../db/database';",
      resolveDir: process.cwd(),
      sourcefile: 'profile-test-entry.ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    plugins: [{
      name: 'profile-test-mocks',
      setup(builder) {
        builder.onResolve({ filter: /^(?:@capacitor\/core|@capacitor\/camera|\.\.\/db\/database|\.\.\/services\/appUpdater)$/ }, (args) => ({
          path: args.path,
          namespace: 'profile-mock',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'profile-mock' }, (args) => ({
          contents: mocks[args.path],
          loader: 'js',
        }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

test('Android photo selection previews and saves the returned image; cancellation preserves the old photo', async () => {
  const { openProfileModal, Camera, db } = await loadProfileModal();
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const handlers = {};
      elements.set(id, {
        value: '', innerHTML: '', disabled: false,
        classList: { add() {}, remove() {} },
        addEventListener: (event, handler) => { handlers[event] = handler; },
        dispatch: (event, data = {}) => handlers[event](data),
      });
    }
    return elements.get(id);
  }
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById: element,
    querySelector: () => element('save-button'),
  };
  const saved = [];
  const toasts = [];
  db.saveLocalProfile = async (profile) => saved.push(profile);
  const options = {
    profile: { name: 'Test', age: null, sex: 'Prefer not to say', photo: 'old-photo' },
    demoModeEnabled: false,
    latestRelease: null,
    onSave: async () => {},
    onDemoModeChange() {},
    onLoadSampleData: async () => {},
    onViewTerms() {},
    onToast: (message) => toasts.push(message),
    onClose() {},
  };
  try {
    await openProfileModal(options);
    element('profile-name').value = 'Test';
    let resolvePhoto;
    Camera.getPhoto = () => new Promise((resolve) => { resolvePhoto = resolve; });
    const selection = element('profile-photo-button').dispatch('click');
    assert.equal(element('save-button').disabled, true);
    resolvePhoto({ dataUrl: 'data:image/jpeg;base64,dGVzdA==' });
    await selection;
    assert.equal(element('save-button').disabled, false);
    assert.match(element('profile-photo-preview').innerHTML, /data:image\/jpeg;base64,dGVzdA==/);
    await element('profile-modal-form').dispatch('submit', { preventDefault() {} });
    assert.equal(saved[0].photo, 'data:image/jpeg;base64,dGVzdA==');

    await openProfileModal(options);
    Camera.getPhoto = async () => { throw new Error('User cancelled photos app'); };
    await element('profile-photo-button').dispatch('click');
    await element('profile-modal-form').dispatch('submit', { preventDefault() {} });
    assert.equal(saved[1].photo, 'old-photo');
    assert.equal(toasts.filter((message) => message === 'Unable to use that photo').length, 0);
  } finally {
    globalThis.document = previousDocument;
  }
});
