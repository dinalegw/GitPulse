'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';

const TRANSLATE_SCRIPT = 'https://cdn.staticfile.net/translate.js/3.18.66/translate.js';
export const LANGUAGE_MENU_ID = 'gitpulse-translate-menu';

type TranslateApi = {
  language: { setLocal: (language: string) => void; setUrlParamControl: (name?: string) => void };
  service: { use: (service: string) => void };
  listener: { start: () => void };
  selectLanguageTag: { show: boolean; languages: string; documentId: string };
  setDocuments: (documents: HTMLElement[]) => void;
  execute: () => void;
};

declare global {
  interface Window {
    translate?: TranslateApi;
  }
}

function configureTranslation() {
  const translate = window.translate;
  const content = document.querySelector<HTMLElement>('[data-translate-content="true"]');
  if (!translate || !content) return;

  // Translate only pages that explicitly opt in. GitHub connection and the
  // command playground deliberately do not use this third-party browser code.
  translate.setDocuments([content]);
  translate.language.setLocal('english');
  translate.language.setUrlParamControl('lang');
  translate.service.use('client.edge');
  translate.selectLanguageTag.show = true;
  translate.selectLanguageTag.languages = 'english,spanish,french,german,portuguese,arabic,chinese_simplified';
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
