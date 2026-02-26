
import fs from 'node:fs/promises';
import path from 'node:path';

const WORKER_PATH = path.join(process.cwd(), 'dist/_worker.js/index.js');

async function injectScheduled() {
    try {
        const content = await fs.readFile(WORKER_PATH, 'utf-8');

        // Check if already injected to avoid duplicates if run multiple times
        if (content.includes('export const scheduled')) {
            console.log('✅ Scheduled handler already present.');
            return;
        }

        const injection = `
// === INJECTED SCHEDULED HANDLER ===
export const scheduled = async (event, env, ctx) => {
    // Call the internal API endpoint to trigger Carl
    // We use the custom domain if available, or localhost fallback (which won't work in prod but helps structure)
    // Actually, in a worker, we should just use the fetch handler of the app itself? 
    // No, we can't easily access the 'app' instance here without complex parsing.
    // The safest way for a purely external trigger is to fetch the public URL.
    
    // HOWEVER, we need to know the domain. 
    // Hardcoding 'rave.arca.de.com' for now as per wrangler.jsonc
    const url = "https://rave.arca.de.com/api/admin/cron-trigger";
    
    console.log("⏰ Cron Trigger Fired: Fetching " + url);
    
    const res = await fetch(url);
    console.log("⏰ Cron Trigger Result: " + res.status);
};
`;

        await fs.appendFile(WORKER_PATH, injection);
        console.log(`✅ Injected 'scheduled' handler into ${WORKER_PATH}`);

    } catch (e) {
        console.error('❌ Failed to inject scheduled handler:', e);
        process.exit(1);
    }
}

injectScheduled();
