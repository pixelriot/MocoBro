#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const browserDir = path.join('docs', 'browser');
const docsDir = 'docs';

try {
    // Move all files from docs/browser to docs root
    if (fs.existsSync(browserDir)) {
        fs.readdirSync(browserDir).forEach(file => {
            const src = path.join(browserDir, file);
            const dest = path.join(docsDir, file);
            fs.renameSync(src, dest);
        });
        // Remove empty browser directory
        fs.rmdirSync(browserDir);
        console.log('✓ Moved browser folder contents to docs root');
    }
} catch (err) {
    console.error('Error organizing build output:', err);
    process.exit(1);
}
