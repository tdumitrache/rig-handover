---
name: publish-preview
description: Publish a rig page as a one-file HTML preview on GitHub Pages, and later take the lane marker off it (ADR 0003). Use for a plan's "Preview for review" and "Clean up" sections.
---

# publish-preview

A preview is one HTML file on a public link we can upload over (ADR 0003). Here: a separate
public repo `<owner>/rig-preview` served by GitHub Pages. Never put the preview in this repo.

Ask the human before the first upload and before the clean upload: what, where, who sees it, undo.

## Save the page (a command, not a browser save-as)

```sh
# save.mts, outside the repo:
#   import { writeFileSync } from 'node:fs';
#   import { createApp } from '<repo>/src/app.tsx';
#   const r = await createApp().request(process.argv[3]);
#   writeFileSync(process.argv[2], await r.text());
npx tsx --env-file=.env save.mts ../preview/index.html /digest/<night>
```

Without the marker: drop the `LANE_MARKER` line from a copy of `.env` and pass that copy.
Check: `grep -o 'class="marker">[^<]*' index.html` reads `no marker set`.

## First upload

```sh
cd ../preview && git init -b main && git add index.html && git commit -m "preview"
gh repo create rig-preview --public --source . --push
gh api -X POST repos/<owner>/rig-preview/pages -f 'source[branch]=main' -f 'source[path]=/'
```

## Check the link before you send it

Fetch it from outside: `curl -s -o /dev/null -w '%{http_code}' <link>`. The folder link can
return 404 for minutes after a good deploy; `.../rig-preview/index.html` returns 200 sooner.
Send the link that returns 200 and shows the marker.

## Clean upload (after the review is in)

Replace history, so no commit keeps the marker:

```sh
git checkout --orphan clean && git add index.html && git commit -m "preview, no marker"
git branch -D main && git branch -m main && git push -f origin main
```

Then read the live page (`?v=$RANDOM` skips the cache) until it shows `no marker set`.
A green upload is not a clean link.

## Stuck deploy

`gh run list -R <owner>/rig-preview` shows failures with "due to in progress deployment"
and the cancel API says that deploy is finished: turn Pages off and on, same link.

```sh
gh api -X DELETE repos/<owner>/rig-preview/pages
gh api -X POST repos/<owner>/rig-preview/pages -f 'source[branch]=main' -f 'source[path]=/'
```

Undo everything: `gh repo delete <owner>/rig-preview`.
