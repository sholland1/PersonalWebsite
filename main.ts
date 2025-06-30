import Handlebars from "npm:handlebars";
import { expandGlob, emptyDir, ensureDir, copy } from "jsr:@std/fs";

import {
    transformerNotationFocus,
    transformerNotationDiff,
    transformerNotationErrorLevel,
} from 'npm:@shikijs/transformers';
import { codeToHtml } from "npm:shiki";

const OUTPUT_DIR = "output";
const NOTES_DIR = "../../OneDrive/Documents/Notes"
const TEMPLATE_FILE = "template.html";

const base_url = Deno.args[0];

console.log(`Creating basic site with base url: ${base_url}...`);
const blogParams = await Array.fromAsync(processBlogFiles("pages/blog/*.html"));
blogParams.sort(flip(compareByDate));
const blogIndexParams = createIndexParams("Blog Index", "blog/index.html", blogParams);
const topLevelParams = await Array.fromAsync(processBlogFiles("pages/*.html"));
const rankingsParams = await Array.fromAsync(processRankingsFiles());
const rankingsIndexParams = createIndexParams("Game Rankings Index", "game-rankings/index.html", rankingsParams);
const animalsParams = await processAnimalPics("assets/images/animals");
// const quotesParams = await processQuotesFile(`${NOTES_DIR}/Quotes.txt`);

const siteParams: SiteParams = {
    Blog: blogParams,
    GameRankings: rankingsParams,
    TopLevel: [animalsParams, ...topLevelParams],
};

console.log("Creating nav...");
const nav_content = generateNavHtml(siteParams).join('\n');
// console.log(nav_content);

console.log("Emptying output directory...");
await emptyDir(OUTPUT_DIR);

console.log("Adding nav to template...");
const allParams = [...Object.values(siteParams).flat(), blogIndexParams, rankingsIndexParams].map(params => ({
    ...params,
    nav_content,
    current_year: new Date().getFullYear(),
    base_url,
}));

// console.log(allParams)

const templateText = await Deno.readTextFile(TEMPLATE_FILE);
const template = Handlebars.compile(templateText);

for (const params of allParams) {
    console.log(`Generating ${params.path}`);
    const outputFilename = `${OUTPUT_DIR}/${params.path}`;
    await ensureDir(outputFilename.substring(0, outputFilename.lastIndexOf('/')));
    await Deno.writeTextFile(outputFilename, template(params));
}

console.log("Copying assets...");
await copy("assets", `${OUTPUT_DIR}/assets`);

function generateNavHtml(siteParams: SiteParams): string[] {
    console.log(`Processing Blog`);
    const parts = ['<ul>'];
    parts.push('<li><a href="blog/index.html">Blog</a><ul>')
    for (const blog of siteParams.Blog) {
        console.log(`  Processing ${blog.path}`);
        parts.push(`<li><a href="${blog.path}">${blog.title}</a></li>`);
    }
    parts.push('</ul>');

    console.log(`Processing GameRankings`);
    parts.push('<li><a href="game-rankings/index.html">Game Rankings</a><ul>')
    for (const ranking of siteParams.GameRankings) {
        console.log(`  Processing ${ranking.path}`);
        const linkText = ranking.path.split('/').pop()?.replace('.html', '');
        parts.push(`<li><a href="${ranking.path}">${linkText}</a></li>`);
    }
    parts.push('</ul>');

    console.log(`Processing TopLevel`);
    for (const other of siteParams.TopLevel) {
        console.log(`  Processing ${other.path}`);
        parts.push(`<li><a href="/${other.path}">${other.title}</a></li>`);
    }
    parts.push('</ul>');
    return parts;
}

async function* processBlogFiles(glob: string) {
    const files = await Array.fromAsync(expandGlob(glob));
    for (const file of files) {
        const articleText = await Deno.readTextFile(file.path);
        const relativePath = file.path.replace(/^.*?pages/, '').replace(/^\//, '');
        yield await parseArticle(articleText, relativePath);
    }
}

function createIndexParams(title: string, path: string, params: Array<ArticleParams>): { title: string; path: string; content: string; } {
    params.sort(flip(compareByDate));
    return {
        title, path,
        content: params.map(page => `<h4><a href="${page.path}">${page.title}</a> - ${page.date_published || page.date_updated || 'No date'}</h4>`).join('\n'),
    };
}

async function parseArticle(articleText: string, path: string): Promise<ArticleParams> {
    /* Format of Article
<!--
title: Blog 1
date_published: 2024-10-08 (optional)
date_updated: 2024-10-09 (optional)
tags: a, b, c
-->
<article>Html content for rest of file</article>
    */
    const metadata: { [key: string]: string } = {};
    let contentStartIndex = 0;

    const lines = articleText.split('\n');
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '-->') {
            contentStartIndex = i + 1;
            break;
        }
        const [key, value] = line.split(':').map(part => part.trim());
        if (key && value) {
            metadata[key] = value;
        }
    }

    return {
        title: metadata.title,
        date_published: metadata.date_published || null,
        date_updated: metadata.date_updated || null,
        tags: metadata.tags ? metadata.tags.split(',').map(tag => tag.trim()) : [],
        content: await highlightCodeBlocks(lines.slice(contentStartIndex).join('\n').trim()),
        path,
    };
}

async function* processRankingsFiles(): AsyncGenerator<ArticleParams> {
    const files = await Array.fromAsync(expandGlob(`${NOTES_DIR}/*Rankings.txt`));
    for (const file of files) {
        const rankingText = await Deno.readTextFile(file.path);
        const lines = rankingText.split('\n').filter(line => line.trim() !== '');
        const fileInfo = await Deno.stat(file.path);
        yield {
            title: `My Ranking of the ${file.name.replace('.txt', '').replace('Rankings', '')} Games`,
            date_published: null,
            date_updated: getModifiedDate(fileInfo.mtime),
            content: `<ol>${lines.map(line => `<li>${line.trim()}</li>`).join('\n')}</ol>`,
            tags: ['fun'],
            path: `game-rankings/${file.name.replace('Rankings.txt', '.html')}`,
        };
    }
}

async function processAnimalPics(imageDir: string): Promise<ArticleParams> {
    const imageFiles = await Array.fromAsync(Deno.readDir(imageDir))
        .then(files => files.sort((a, b) => a.name.localeCompare(b.name)));
    const imageTags: string[] = [];
    let latestModified: Date | null = null;

    imageTags.push(`<div class="img-container">`);
    for (const entry of imageFiles) {
        if (entry.isFile && entry.name.endsWith('.jpg')) {
            const imagePath = `${imageDir}/${entry.name}`;
            const fileInfo = await Deno.stat(imagePath);
            if (!latestModified || fileInfo.mtime && fileInfo.mtime > latestModified) {
                latestModified = fileInfo.mtime;
            }

            const altText = entry.name.substring(3).replace('.jpg', '');
            imageTags.push(`<img src="${imagePath}" alt="${altText}">`);
        }
    }
    imageTags.push(`</div>`);

    return {
        title: 'Animal Photos',
        date_updated: getModifiedDate(latestModified),
        date_published: null,
        content: `<article>${imageTags.join('\n')}</article>`,
        tags: ['fun'],
        path: 'animals.html',
    }
}

async function processQuotesFile(quotesFile: string): Promise<ArticleParams> {
    const quotesText = await Deno.readTextFile(quotesFile);
    const lines = quotesText.split('\n').filter(line => line.trim() !== '');
    const fileInfo = await Deno.stat(quotesFile);
    return {
        title: 'Quotes',
        date_updated: getModifiedDate(fileInfo.mtime),
        date_published: null,
        content: `<div>${lines.map(line => `<p>${line.trim()}</p>`).join('\n')}</div>`,
        tags: ['fun'],
        path: 'quotes.html',
    };
}

function getModifiedDate(d: Date | null): string {
    return d?.toISOString().split('T')[0] || "";
}

async function highlightCodeBlocks(content: string): Promise<string> {
    const codeBlockRegex = /<code class="language-(\w+)">([\s\S]*?)<\/code>/g;
    return await replaceAsync(content, codeBlockRegex, async (_match, language, code) =>
        await codeToHtml(code, {
            lang: language,
            theme: 'github-dark',
            // transformers: [
            //     transformerNotationFocus(),
            //     transformerNotationDiff(),
            //     transformerNotationErrorLevel(),
            // ],
        }));
}

async function replaceAsync(str: string, regex: RegExp, asyncFn: (...args: string[]) => Promise<string>): Promise<string> {
    const promises: Promise<string>[] = [];
    str.replace(regex, (match, ...args) => {
        const promise = asyncFn(match, ...args);
        promises.push(promise);
        return match;
    });
    const data = await Promise.all(promises);
    return str.replace(regex, () => data.shift() || '');
}

function compareByDate(a: { date_published: string | null, date_updated: string | null }, b: { date_published: string | null, date_updated: string | null }) {
    if (a.date_published && b.date_published) {
        return a.date_published.localeCompare(b.date_published);
    }
    if (a.date_updated && b.date_updated) {
        return a.date_updated.localeCompare(b.date_updated);
    }
    if (!a.date_published && !a.date_updated) return 1;
    if (!b.date_published && !b.date_updated) return -1;
    return 0;
}

function flip<T, U>(f: (a: T, b: T) => U): (a: T, b: T) => U {
    return (a, b) => f(b, a);
}

interface ArticleParams {
    title: string;
    date_published: string | null;
    date_updated: string | null;
    content: string;
    tags: string[];
    path: string;
}

interface SiteParams {
    Blog: Array<{ path: string; title: string }>;
    GameRankings: Array<{ path: string }>;
    TopLevel: Array<{ path: string; title: string }>;
}
