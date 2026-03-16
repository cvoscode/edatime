import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve('frontend/js');

function collectJavaScriptFiles(dirPath) {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectJavaScriptFiles(fullPath));
            continue;
        }
        if (entry.isFile() && fullPath.endsWith('.js')) {
            files.push(fullPath);
        }
    }

    return files;
}

if (!statSync(root).isDirectory()) {
    console.error(`Frontend source directory not found: ${root}`);
    process.exit(1);
}

const files = collectJavaScriptFiles(root).sort();
for (const filePath of files) {
    const result = spawnSync(process.execPath, ['--check', filePath], {
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

console.log(`Validated ${files.length} frontend modules.`);