import { IdReader } from 'romanian-id-prefill/react';
import { createSyntheticMrz } from '../tests/fixtures';
import { initialLanguage } from './i18n';

function demoSource() {
  const fixture = createSyntheticMrz('TD1');
  const canvas = document.createElement('canvas');
  canvas.width = 1600; canvas.height = 285;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#171936'; context.font = '48px "IBM Plex Mono", monospace';
  fixture.lines.forEach((line, index) => context.fillText(line, 58, 75 + index * 80));
  return canvas;
}

function updateDocumentLanguage(language: 'en' | 'ro') {
  document.documentElement.lang = language;
  document.title = language === 'ro' ? 'Local ID — Completare din cartea de identitate' : 'Local ID — Romanian identity-card prefill';
}

export function App() {
  const language = initialLanguage(navigator.languages.length ? navigator.languages : [navigator.language]);
  return <IdReader assetBaseUrl={new URL(import.meta.env.BASE_URL, window.location.href).href} language={language} onLanguageChange={updateDocumentLanguage} showHeader demoSource={demoSource} onConfirm={() => {}} />;
}
