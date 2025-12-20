
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SOURCE_DIR = path.join(__dirname, '../packages/poker-engine/src');
const DEST_DIR = path.join(__dirname, '../supabase/functions/_shared/poker-engine');

// Files to sync (we can also scan the dir)
const FILES_TO_SYNC = [
    'types.ts',
    'deck.ts',
    'evaluator.ts',
    'pot.ts',
    'betting.ts',
    'game.ts',
    // 'index.ts' might not be needed or needs special handling since Deno users import files directly usually
];

// Helper to colored output
const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
};

function transformImportsForDeno(content) {
    // Regex to find imports like: from './module' and replace with from './module.ts'
    // It captures: import/export ... from '...';
    // We strictly look for relative imports starting with ./ or ../
    return content.replace(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g, (match, importPath) => {
        if (importPath.endsWith('.ts')) return match; // Already has extension
        return `from '${importPath}.ts'`;
    });
}

function getDiff(filename, oldContent, newContent) {
    // Write temp files to use 'diff' command (simplest way to get nice colored diffs on Mac/Linux)
    const tmpOld = `/tmp/old_${filename}`;
    const tmpNew = `/tmp/new_${filename}`;
    fs.writeFileSync(tmpOld, oldContent || '');
    fs.writeFileSync(tmpNew, newContent);

    try {
        // diff -u --color=always
        // catch error because diff returns exit code 1 if files differ
        execSync(`diff -u --color=always ${tmpOld} ${tmpNew}`, { encoding: 'utf8', stdio: 'pipe' });
        return null; // No difference
    } catch (e) {
        return e.stdout; // The diff output
    }
}

function sync() {
    console.log(`${colors.blue}🔄 Syncing Poker Engine from packages/ to Supabase...${colors.reset}\n`);

    if (!fs.existsSync(DEST_DIR)) {
        console.log(`Creating destination directory: ${DEST_DIR}`);
        fs.mkdirSync(DEST_DIR, { recursive: true });
    }

    // Get all .ts files from source if we want to be dynamic
    const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.ts') && f !== 'index.ts');

    let hasChanges = false;

    files.forEach(file => {
        const sourcePath = path.join(SOURCE_DIR, file);
        const destPath = path.join(DEST_DIR, file);

        console.log(`Checking ${colors.yellow}${file}${colors.reset}...`);

        let content = fs.readFileSync(sourcePath, 'utf8');

        // Transform for Deno
        const transformedContent = transformImportsForDeno(content);

        let destContent = '';
        if (fs.existsSync(destPath)) {
            destContent = fs.readFileSync(destPath, 'utf8');
        }

        if (transformedContent !== destContent) {
            hasChanges = true;
            console.log(`${colors.green}📝 Changes detected in ${file}:${colors.reset}`);

            const diff = getDiff(file, destContent, transformedContent);
            if (diff) {
                console.log(diff);
            } else {
                console.log("(New file or content changed but diff failed??)");
            }

            fs.writeFileSync(destPath, transformedContent);
            console.log(`✅ Updated ${destPath}\n`);
        } else {
            console.log(`👍 Up to date\n`);
        }
    });

    if (hasChanges) {
        console.log(`${colors.green}✨ Synchronization complete!${colors.reset}`);
    } else {
        console.log(`${colors.blue}✨ Everything is already in sync.${colors.reset}`);
    }
}

sync();
