export * as api from '../app/api/[...path]/route';
export * as auth from '../app/api/auth/[...all]/route';
export {match} from '../lib/matching';
export {cleanImage} from '../lib/images';
export {env} from 'cloudflare:workers';

export {isStrongMatch} from '../lib/matching';
export {maintain} from '../lib/maintenance';
export {drainAuthEmails,sendAuthEmail,authMailSettings} from '../lib/auth-email';

export {processEmbeddingJobs,processSearchJobs,workerHeartbeat} from '../lib/ai-jobs';
export {MODEL_VERSION,cosine,multimodal,publicEmbeddingText} from '../lib/intelligence';
export {similarityLabel,notificationText} from '../lib/matching';

export {resetDemo} from '../lib/demo';
