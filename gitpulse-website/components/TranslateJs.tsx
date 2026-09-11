'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';

const TRANSLATE_SCRIPT = 'https://cdn.staticfile.net/translate.js/3.18.66/translate.js';
export const LANGUAGE_MENU_ID = 'gitpulse-translate-menu';

type TranslateApi = {
  language: { setLocal: (language: string) => void };
  service: { use: (service: string) => void };
  listener: { start: () => void };
  selectLanguageTag: { show: boolean; languages: string; documentId: string };
  execute: () => void;
};

declare global {
  interface Window {
    translate?: TranslateApi;
  }
}

function configureTranslation() {
  const translate = window.translate;
  if (!translate) return;

  // Keep this to translate.js's documented browser flow. The component itself
  // is mounted only on public Home and Docs pages, so connection and playground
  // pages never load or execute the third-party script.
  translate.language.setLocal('english');
  // Use translate.js's standard public service. It publishes the broadest
  // available language list, including Hausa, Igbo, and Yoruba.
  translate.service.use('translate.service');
  translate.selectLanguageTag.show = true;
  // Keep the library's complete language list; do not restrict it.
  translate.selectLanguageTag.documentId = LANGUAGE_MENU_ID;
  translate.listener.start();
  translate.execute();
}

export function TranslateJs() {
  const [loaded, setLoaded] = useState(false);
  const pathname = usePathname();
  const isPublicTranslationRoute = pathname === '/' || pathname === '/docs';

  useEffect(() => {
    if (loaded && isPublicTranslationRoute) configureTranslation();
  }, [isPublicTranslationRoute, loaded]);

  if (!isPublicTranslationRoute) return null;

  return (
    <Script
      id="translate-js"
      src={TRANSLATE_SCRIPT}
      strategy="afterInteractive"
      onLoad={() => setLoaded(true)}
      onError={() => console.warn('GitPulse translation controls could not be loaded.')}
    />
  );
}
