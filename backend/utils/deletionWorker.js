import DeletionJob from '../models/DeletionJob.js';
import { performFullAccountDeletion } from '../controllers/authController.js';

let running = false;

export const startDeletionWorker = (pollInterval = 3000) => {
  if (running) return;
  running = true;
  console.log('[deletionWorker] starting worker');

  const loop = async () => {
    try {
      // find a queued job
      const job = await DeletionJob.findOneAndUpdate({ status: 'queued' }, { status: 'running', startedAt: new Date(), progress: 1, message: 'Starting' }, { new: true });
      if (!job) return;

      console.log('[deletionWorker] picked job', job._id.toString());

      // helper to update job progress
      const updateProgress = async (percent, message) => {
        await DeletionJob.findByIdAndUpdate(job._id, { progress: percent, message }, { new: true });
      };

      const result = await performFullAccountDeletion(job.user, updateProgress);
      if (result && result.success) {
        await DeletionJob.findByIdAndUpdate(job._id, { status: 'completed', progress: 100, message: 'Completed', finishedAt: new Date() });
        console.log('[deletionWorker] job completed', job._id.toString());
      } else {
        await DeletionJob.findByIdAndUpdate(job._id, { status: 'failed', error: result?.error || 'unknown', message: 'Failed', finishedAt: new Date() });
        console.log('[deletionWorker] job failed', job._id.toString(), result?.error || '');
      }

    } catch (err) {
      console.error('[deletionWorker] loop error', err.message || err);
    }
  };

  // Polling loop
  setInterval(loop, pollInterval);
};

export default { startDeletionWorker };
