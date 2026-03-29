import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CONFIG_DIR = process.env.BOT_CONFIG_DIR || '/app/data/config';
const PROFILE_PATH = join(CONFIG_DIR, 'bot-profile.json');

export interface BotProfileField {
	name: string;
	value: string;
	verified?: boolean; // if the value is a URL, can be rel=me verified
}

export interface BotProfile {
	username: string;
	displayName: string;
	summary: string;
	avatarUrl: string;
	headerUrl: string;
	fields: BotProfileField[];
	postPrefix: string;
	postSuffix: string;
}

const DEFAULT_PROFILE: BotProfile = {
	username: 'bot',
	displayName: 'NewsDiff Bot',
	summary: 'I track changes in news articles and post the diffs. Follow me to see when headlines and content get edited after publication.',
	avatarUrl: '',
	headerUrl: '',
	fields: [
		{ name: 'Website', value: '' },
		{ name: 'Source', value: 'https://github.com/rmdes/newsdiff' }
	],
	postPrefix: '',
	postSuffix: ''
};

export async function loadBotProfile(): Promise<BotProfile> {
	try {
		const data = await readFile(PROFILE_PATH, 'utf-8');
		return { ...DEFAULT_PROFILE, ...JSON.parse(data) };
	} catch {
		return { ...DEFAULT_PROFILE };
	}
}

export async function saveBotProfile(profile: BotProfile): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true });
	await writeFile(PROFILE_PATH, JSON.stringify(profile, null, 2));
}
