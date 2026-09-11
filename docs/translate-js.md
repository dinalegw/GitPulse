# translate.js integration

GitPulse uses [translate.js](https://github.com/xnx3/translate) to provide an optional browser-side language selector on its public Home page and Documentation index. It loads the upstream CDN at a pinned version after the page becomes interactive.

## Full language support and automatic choice

GitPulse deliberately leaves `translate.selectLanguageTag.languages` empty. In translate.js, that uses its full built-in language list instead of a hand-picked subset. It also calls `translate.setAutoDiscriminateLocalLanguage()` so the first language is chosen from the visitor's browser settings; visitors can always choose another language from the selector.

## Why it is scoped

translate.js is third-party JavaScript that reads page content in the visitor's browser in order to translate it. GitPulse therefore opts in only public content with `data-translate-content="true"`. The GitHub connection flow and command playground are deliberately excluded.

Do not add this kind of client-side translation script to pages that display private account data, payments, admin controls, secrets, or any content you do not want a translation service to process.

## Attribution

GitPulse gratefully uses [translate.js](https://github.com/xnx3/translate), created by [Guan Leiming (xnx3)](https://github.com/xnx3), under its MIT License. This acknowledgement does not imply endorsement or a partnership.

## Add it to another website

1. Create a client component that uses `next/script` to load the pinned CDN URL.
2. Configure the local language, automatic language discrimination, and translation service, then call `translate.execute()`.
3. Add a menu container such as `<div id="your-language-menu" />` and set `translate.selectLanguageTag.documentId` to that id.
4. Do not set `translate.selectLanguageTag.languages` if you want the full built-in language list.
5. Restrict translation to the public container with `translate.setDocuments([element])` when the page also contains sensitive areas.

The smallest HTML-only version is:

```html
<div id="translate"></div>
<script src="https://cdn.staticfile.net/translate.js/3.18.66/translate.js"></script>
<script>
  translate.language.setLocal('english');
  translate.setAutoDiscriminateLocalLanguage();
  translate.service.use('client.edge');
  translate.selectLanguageTag.documentId = 'translate';
  translate.listener.start();
  translate.execute();
</script>
```
