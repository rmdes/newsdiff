import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
	const origin = process.env.BOT_ORIGIN || process.env.ORIGIN || '';
	const username = process.env.BOT_USERNAME || 'bot';
	const host = origin ? new URL(origin).host : '';
	const botHandle = host ? `@${username}@${host}` : '';
	const botActorUrl = host ? `${origin}/ap/actor/${username}` : '';

	return { botHandle, botActorUrl };
};
