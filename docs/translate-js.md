# translate.js integration

GitPulse uses [translate.js](https://github.com/xnx3/translate) to provide an optional browser-side language selector on the public Home and Documentation index pages. The integration loads the upstream CDN at a pinned version and initializes it only after the page becomes interactive.

## Why it is scoped

translate.js is third-party JavaScript that reads page content in the visitor's browser in order to translate it. GitPulse therefore opts in only public content with `data-translate-content="true"`. The GitHub connection flow and command playground are deliberately excluded.

Do not add this kind of client-side translation script to pages that display private account data, payments, admin controls, secrets, or any content you do not want a translation service to process.

## Add it to another Next.js site

1. Create a client component that uses `next/script` to load the pinned CDN URL.
2. In `onLoad`, configure the local language and translation service, then call `translate.execute()`.
3. Add a menu container such as `<div id="your-language-menu" />` and set `translate.selectLanguageTag.documentId` to that id.
4. Restrict translation to the public container with `translate.setDocuments([element])`.
5. Test with JavaScript disabled, on mobile, and on every route that contains dynamic content.

The smallest HTML-only version is:

```html
<div id="translate"></div>
<script src="https://cdn.staticfile.net/translate.js/3.18.66/translate.js"></script>
<script>
  translate.language.setLocal('english');
  translate.service.use('client.edge');
  translate.selectLanguageTag.documentId = 'translate';
  translate.execute();
</script>
```

GitHub profile READMEs do not execute JavaScript, so this script cannot be embedded there. Use a hosted page (for example, GitHub Pages) for live translation, or maintain separate Markdown translations with links between them.
