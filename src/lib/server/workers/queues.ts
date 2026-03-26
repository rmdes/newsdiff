import { Queue } from 'bullmq';
import { getRedisConnection } from './connection';

let _queues: { feedPollQueue: Queue; syndicateQueue: Queue } | undefined;

export function createQueues() {
	if (_queues) return _queues;

	const connection = getRedisConnection();
	_queues = {
		feedPollQueue: new Queue('feed-poll', { connection }),
		syndicateQueue: new Queue('syndicate', { connection })
	};

	return _queues;
}
