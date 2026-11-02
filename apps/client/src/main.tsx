import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import './styles.css';
import App from './App';
import { OnlineProvider } from './lib/net';
import { isNative } from './lib/platform';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OnlineProvider>
      <App />
    </OnlineProvider>
  </React.StrictMode>
);

// Android geri tuşu: önce uygulama içinde bir adım geri, ana ekrandaysa uygulamayı arka plana al
if (isNative()) {
  import('@capacitor/app').then(({ App: CapApp }) => {
    CapApp.addListener('backButton', () => {
      const notHandled = window.dispatchEvent(new CustomEvent('ka-back', { cancelable: true }));
      if (notHandled) CapApp.minimizeApp();
    });
  });
}

// PWA: tarayıcıda çevrimdışı önbellek (Android uygulamasında gerekmez)
if ('serviceWorker' in navigator && !isNative() && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
