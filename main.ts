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

const templateText = await Deno.readTextFile("template.html");
const template = Handlebars.compile(templateText);

console.log("Creating basic site...");
const blogParams = processBlogFiles("pages/blog/*.html");
const topLevelParams = processBlogFiles("pages/*.html");
const rankingsParams = processRankingsFiles();
const quotesParams = processQuotesFile(`${NOTES_DIR}/Quotes.txt`);

const siteParams = {
    Blog: await Array.fromAsync(blogParams),
    GameRankings: await Array.fromAsync(rankingsParams),
    TopLevel: [await quotesParams, ...await Array.fromAsync(topLevelParams)],
};

for (const [key, arr] of Object.entries(siteParams)) {
    console.log(`Processing ${key}`);
    for (const params of arr) {
        console.log(`  Processing ${params.path}`);
    }
}

console.log("Creating nav...");
const navHtml = generateNavHtml(siteParams).join('\n');
// console.log(navHtml);

console.log("Emptying output directory...");
await emptyDir(OUTPUT_DIR);

console.log("Adding nav to template...");

const allParams = [...siteParams.Blog, ...siteParams.GameRankings, ...siteParams.TopLevel].map(params => ({
    ...params,
    nav_content: navHtml,
    current_year: new Date().getFullYear(),
}));

// console.log(allParams)

for (const params of allParams) {
    console.log(`Processing ${params.path}`);
    const outputFilename = `${OUTPUT_DIR}/${params.path}`;
    await ensureDir(outputFilename.substring(0, outputFilename.lastIndexOf('/')));
    await Deno.writeTextFile(outputFilename, template(params));
}

console.log("Copying assets...");
await copy("assets", `${OUTPUT_DIR}/assets`);

function generateNavHtml(siteParams): string[] {
    const parts = ['<ul>'];
    parts.push('<li><a href="blog/index.html">Blog</a><ul>')
    for (const blog of siteParams.Blog) {
        const formattedTitle = blog.title.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        parts.push(`<li><a href="${blog.path}">${formattedTitle}</a></li>`);
    }
    parts.push('</ul>');

    parts.push('<li><a href="game-rankings/index.html">Game Rankings</a><ul>')
    for (const ranking of siteParams.GameRankings) {
        const linkText = ranking.path.split('/').pop()?.replace('.html', '');
        parts.push(`<li><a href="${ranking.path}">${linkText}</a></li>`);
    }
    parts.push('</ul>');

    for (const other of siteParams.TopLevel) {
        const formattedTitle = other.title.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        parts.push(`<li><a href="${other.path}">${formattedTitle}</a></li>`);
    }
    parts.push('</ul>');
    return parts;
}

async function* processBlogFiles(glob: string) {
    const files = await Array.fromAsync(expandGlob(glob));
    for (const file of files) {
        const articleText = await Deno.readTextFile(file.path);
        const relativePath = file.path.replace(/^.*?pages/, '').replace(/^\//, '');
        yield await parseBlog(articleText, relativePath);
    }
}

async function parseBlog(articleText: string, path: string) {
    /* Format of Blog
<!--
title: Blog 1
date_published: 2024-10-08 (optional)
date_updated: 2024-10-09 (optional)
tags: a, b, c
-->
<h2>Html content for rest of file</h2>
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
        path: path,
    };
}

async function* processRankingsFiles() {
    const files = await Array.fromAsync(expandGlob(`${NOTES_DIR}/*Rankings.txt`));
    for (const file of files) {
        const rankingText = await Deno.readTextFile(file.path);
        const lines = rankingText.split('\n').filter(line => line.trim() !== '');
        const fileInfo = await Deno.stat(file.path);
        yield {
            title: `My Ranking of the ${file.name.replace('.txt', '').replace('Rankings', '')} Games`,
            date_updated: getModifiedDate(fileInfo),
            content: `<ol>${lines.map(line => `<li>${line.trim()}</li>`).join('\n')}</ol>`,
            path: `game-rankings/${file.name.replace('Rankings.txt', '.html')}`,
        };

    }
}

async function processQuotesFile(quotesFile: string) {
    const quotesText = await Deno.readTextFile(quotesFile);
    const lines = quotesText.split('\n').filter(line => line.trim() !== '');
    const fileInfo = await Deno.stat(quotesFile);
    return {
        title: 'Quotes',
        date_updated: getModifiedDate(fileInfo),
        content: `<div>${lines.map(line => `<p>${line.trim()}</p>`).join('\n')}</div>`,
        path: 'quotes.html',
    };
}

function getModifiedDate(fileInfo: Deno.FileInfo) {
  return fileInfo.mtime?.toISOString().split('T')[0] || "";
}

async function highlightCodeBlocks(content: string): Promise<string> {
    const codeBlockRegex = /<code class="language-(\w+)">([\s\S]*?)<\/code>/g;
    return await replaceAsync(content, codeBlockRegex, async (_match, language, code) => {
        return await codeToHtml(code, {
            lang: language,
            theme: 'github-light',
            transformers: [
                transformerNotationFocus(),
                transformerNotationDiff(),
                transformerNotationErrorLevel(),
            ],
        });
    });
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
