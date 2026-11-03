import { render } from 'preact';
import './fonts';
import './ui/style.css';
import { App } from './ui/App';
import { loadFont } from './engine/scene3d';

render(<App />, document.getElementById('app')!);

// Asks the system not to clear the user's projects when storage runs low.
void navigator.storage?.persist?.().catch(() => {});

// Most Android phones need this audio encoder for export, so it loads early and works offline.
setTimeout(() => {
  void import('@mediabunny/aac-encoder').catch(() => {});
  void loadFont().catch(() => {});
}, 200);

// The engine test hooks exist only in development and in the Android smoke-test build.
if (import.meta.env.DEV || import.meta.env.VITE_TEST_API === '1') void import('./testapi');
