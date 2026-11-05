import dotenv from 'dotenv';
import path from 'path';

// Repo-root .env; hosts like Render set real env vars and skip this file.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
