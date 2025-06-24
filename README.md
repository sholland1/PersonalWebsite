# mydumbsite.net

This is the static site generator for my personal website, mydumbsite.net.

## Project Overview
It is written in TypeScript using the Deno runtime.
HTML pages are generated from a template and article files written in HTML.
Each page has some metadata at the top inside an HTML comment.
Some pages are generated from text files in my notes.
The site is hosted on netlify.

## Features

- Static site
- Responsive
- Code highlighting

## Generate site
```sh
./project run http://localhost:8000
./project run https://mydumbsite.net
```

## Serve
```sh
./project serve
```

## Open in browser
```sh
./project open
```

## Publish
```sh
./project publish
```
