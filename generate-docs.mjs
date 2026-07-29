import fs from 'fs';
import path from 'path';

const MAX_FILE_SIZE = 15000; // Skip files larger than 15KB
const EXCLUDED_DIRS = ['.next', 'node_modules', '.git'];
const EXCLUDED_EXTENSIONS = ['.ico', '.png', '.jpg', '.jpeg', '.woff2', '.ttf', '.sql', '.json']; // excluded json to prevent large db snapshots/locks
const INCLUDED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.mjs', '.md', '.yml'];

const ROOT_DIR = path.resolve('.');
const OUT_FILE = path.resolve('./codebase-docs.html');

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (!EXCLUDED_DIRS.includes(file)) {
        getAllFiles(filePath, fileList);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      if (
        INCLUDED_EXTENSIONS.includes(ext) || file === 'package.json' || file === 'components.json' || file === 'tsconfig.json'
      ) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&" + "amp;")
         .replace(/</g, "&" + "lt;")
         .replace(/>/g, "&" + "gt;")
         .replace(/"/g, "&" + "quot;")
         .replace(/'/g, "&" + "#039;");
}

function generateHtml() {
  const allFiles = getAllFiles(ROOT_DIR);
  console.log('Total files found:', allFiles.length);
  
  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SaaS Starter Codebase Documentation</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f9f9f9; }
        h1, h2, h3 { color: #111; }
        .file-container { background: white; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 24px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .file-header { background: #f0f0f0; padding: 10px 15px; border-bottom: 1px solid #ddd; font-weight: 600; font-family: monospace; display: flex; justify-content: space-between; }
        .file-size { color: #666; font-size: 0.9em; font-weight: normal; }
        pre { margin: 0; padding: 15px; overflow-x: auto; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace; font-size: 13px; line-height: 1.4; background: #fafafa; }
        .nav { background: white; padding: 15px; border-radius: 6px; border: 1px solid #ddd; margin-bottom: 24px; max-height: 400px; overflow-y: auto; }
        .nav ul { list-style: none; padding-left: 20px; }
        .nav a { color: #0366d6; text-decoration: none; }
        .nav a:hover { text-decoration: underline; }
        .too-large { padding: 15px; color: #888; font-style: italic; }
    </style>
</head>
<body>
    <h1>SaaS Starter Codebase Documentation</h1>
    <p>This document contains the source code for the saas-starter application.</p>
    
    <div class="nav">
        <h2>Files Index</h2>
        <ul>
  `;

  const fileData = [];

  for (const file of allFiles) {
    if (file === path.resolve('generate-docs.mjs')) continue; // Skip self

    const relativePath = path.relative(ROOT_DIR, file).replace(/\\\\/g, '/');
    const stats = fs.statSync(file);
    const size = stats.size;
    
    let content = '';
    let isTooLarge = size > MAX_FILE_SIZE;

    if (!isTooLarge) {
        content = fs.readFileSync(file, 'utf-8');
        
        const cStart = "@@COMMENT_START@@";
        const cEnd = "@@COMMENT_END@@";

        // --- INJECT COMMENTS FOR REACT/NEXT.JS NEWCOMERS ---
        // Explain "use client"
        content = content.replace(/['"]use client['"];?/g, match => 
          match + ` ${cStart}// <-- NEXT.JS: Marks this file as a Client Component. It ships to the browser and can use React hooks (useState, useEffect, onClick).${cEnd}`
        );

        // Explain Server Actions
        content = content.replace(/(export async function \w+\(.*\) {)/g, match =>
          match + `\n  ${cStart}// <-- REACT 19 SERVER ACTION: This async function runs securely on the server. Can be called directly from client forms or buttons.${cEnd}`
        );

        // Explain Tailwind CSS classes
        content = content.replace(/(className="[^"]+")/g, match => {
          if (match.includes("flex") || match.includes("min-h-screen") || match.includes("max-w-")) {
            return match + ` ${cStart}/* <-- TAILWIND CSS: Utility classes for styling instead of external CSS files. */${cEnd}`;
          }
          return match;
        });

        // Explain App Router conventions
        if (file.endsWith('page.tsx')) {
          content = `${cStart}// NEXT.JS APP ROUTER: "page.tsx" files automatically become publicly accessible routes based on their folder name.${cEnd}\n` + content;
        } else if (file.endsWith('layout.tsx')) {
          content = `${cStart}// NEXT.JS APP ROUTER: "layout.tsx" wraps around child pages to provide a persistent UI shell (like a sidebar or navbar).${cEnd}\n` + content;
        } else if (file.endsWith('route.ts')) {
          content = `${cStart}// NEXT.JS API ROUTE: "route.ts" handles HTTP methods (GET, POST, etc.) for building backend API endpoints.${cEnd}\n` + content;
        }

        // Explain Drizzle
        if (content.includes('drizzle-orm') || content.includes('drizzle(')) {
          content = `${cStart}// DRIZZLE ORM: A lightweight, type-safe SQL ORM used here to map TypeScript objects directly to database tables.${cEnd}\n` + content;
        }
        // ---------------------------------------------------
    }

    fileData.push({ relativePath, size, content, isTooLarge });
    
    html += `<li><a href="#${relativePath.replace(/[^a-zA-Z0-9-]/g, '-')}">${relativePath}</a> ${(size / 1024).toFixed(1)} KB</li>`;
  }

  html += `
        </ul>
    </div>
    
    <h2>Source Files</h2>
  `;

  for (const file of fileData) {
    const anchorId = file.relativePath.replace(/[^a-zA-Z0-9-]/g, '-');
    html += `
    <div class="file-container" id="${anchorId}">
        <div class="file-header">
            <span>${file.relativePath}</span>
            <span class="file-size">${(file.size / 1024).toFixed(1)} KB</span>
        </div>
    `;

    if (file.isTooLarge) {
        html += `<div class="too-large">File is too large to display directly (> 15KB).</div>`;
    } else {
        let escapedContent = escapeHtml(file.content);
        escapedContent = escapedContent.replace(/@@COMMENT_START@@/g, '<span style="color: #22863a; font-weight: bold; font-style: italic;">');
        escapedContent = escapedContent.replace(/@@COMMENT_END@@/g, '</span>');
        html += `<pre><code>${escapedContent}</code></pre>`;
    }

    html += `</div>`;
  }

  html += `
</body>
</html>
  `;

  fs.writeFileSync(OUT_FILE, html);
  console.log('Documentation generated at:', OUT_FILE);
}

generateHtml();
