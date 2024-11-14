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

await emptyDir(OUTPUT_DIR);
await copy("assets", `${OUTPUT_DIR}/assets`);

await processBlogFiles();
await processRankingsFiles();
await processQuotesFile();

async function processBlogFiles() {
    const files = await Array.fromAsync(expandGlob("pages/**/*.html"));
    for (const file of files) {
        const articleText = await Deno.readTextFile(file.path);
        const params = await parseBlog(articleText);

        const relativePath = file.path.replace(/^.*?pages/, '').replace(/^\//, '');
        const outputFilename = `${OUTPUT_DIR}/${relativePath}`;
        await ensureDir(outputFilename.substring(0, outputFilename.lastIndexOf('/')));
        await Deno.writeTextFile(outputFilename, template(params));
    }
}

async function parseBlog(articleText: string) {
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
    };
}

async function processRankingsFiles() {
    const files = await Array.fromAsync(expandGlob(`${NOTES_DIR}/*Rankings.txt`));
    for (const file of files) {
        const rankingText = await Deno.readTextFile(file.path);
        const lines = rankingText.split('\n').filter(line => line.trim() !== '');
        const fileInfo = await Deno.stat(file.path);
        const params = {
            title: `My Ranking of the ${file.name.replace('.txt', '').replace('Rankings', '')} Games`,
            date_updated: getModifiedDate(fileInfo),
            content: `<ol>${lines.map(line => `<li>${line.trim()}</li>`).join('\n')}</ol>`,
        };

        await ensureDir(`${OUTPUT_DIR}/game-rankings`);
        const outputFilename = `${OUTPUT_DIR}/game-rankings/${file.name.replace('.txt', '.html')}`;
        await Deno.writeTextFile(outputFilename, template(params));
    }
}

async function processQuotesFile() {
    const quoteFile = `${NOTES_DIR}/Quotes.txt`;
    const quotesText = await Deno.readTextFile(quoteFile);
    const lines = quotesText.split('\n').filter(line => line.trim() !== '');
    const fileInfo = await Deno.stat(quoteFile);
    const params = {
        title: 'Quotes',
        date_updated: getModifiedDate(fileInfo),
        content: `<div>${lines.map(line => `<p>${line.trim()}</p>`).join('\n')}</div>`,
    };

    const outputFilename = `${OUTPUT_DIR}/quotes.html`;
    await Deno.writeTextFile(outputFilename, template(params));
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
