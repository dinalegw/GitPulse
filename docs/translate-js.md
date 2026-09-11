# translate.js integration

GitPulse uses [translate.js](https://github.com/xnx3/translate) to provide an optional browser-side language selector on its public Home page and Documentation index. It loads the upstream CDN at a pinned version after the page becomes interactive.

## Full language support

GitPulse leaves translate.js's language list untouched, so the selector uses the complete set provided by the library instead of a hand-picked subset. Visitors can choose any listed language from the selector.

## Translation service

GitPulse uses translate.js's `giteeAI` service setting. The previously used `client.edge` mode depends on a Microsoft Edge authorization endpoint that is no longer available, which allowed the selector to render but prevented the page text from changing. `giteeAI` is a public translate.js-supported service and does not require a GitPulse API key.

## Why it is scoped

translate.js is third-party JavaScript that reads page content in the visitor's browser in order to translate it. GitPulse loads it only on the public Home and Documentation index pages. The GitHub connection flow and command playground are deliberately excluded.

Do not add this kind of client-side translation script to pages that display private account data, payments, admin controls, secrets, or any content you do not want a translation service to process.

## Attribution

GitPulse gratefully uses [translate.js](https://github.com/xnx3/translate), created by [Guan Leiming (xnx3)](https://github.com/xnx3), under its MIT License. This acknowledgement does not imply endorsement or a partnership.

## Add it to another website

1. Create a client component that uses `next/script` to load the pinned CDN URL.
2. Configure the local language and translation service, then call `translate.execute()`.
3. Add a menu container such as `<div id="your-language-menu" />` and set `translate.selectLanguageTag.documentId` to that id.
4. Do not set `translate.selectLanguageTag.languages` if you want the full built-in language list.
5. Load the script only on public pages; exclude pages that display private account data, payments, admin controls, or secrets.

The smallest HTML-only version is:

```html
<div id="translate"></div>
<script src="https://cdn.staticfile.net/translate.js/3.18.66/translate.js"></script>
<script>
  translate.language.setLocal('english');
  translate.service.use('giteeAI');
  translate.selectLanguageTag.documentId = 'translate';
  translate.listener.start();
  translate.execute();
</script>
```
