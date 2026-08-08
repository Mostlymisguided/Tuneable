/**
 * In-memory async jobs for library import preview/execute (progress polling).
 * Pattern mirrors podcast import-progress (process-local, TTL cleanup).
 */

const crypto = require('crypto');
const libraryImportService = require('./libraryImportService');

const JOB_TTL_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

/** @type {Map<string, object>} */
const jobs = new Map();

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs.entries()) {
    const stamp = job.updatedAt?.getTime?.() || job.startedAt?.getTime?.() || 0;
    if (stamp < cutoff) jobs.delete(id);
  }
}, CLEANUP_INTERVAL_MS).unref?.();

function createJob({ userId, type, source }) {
  const id = crypto.randomBytes(16).toString('hex');
  const now = new Date();
  const job = {
    id,
    userId: String(userId),
    type,
    source,
    status: 'queued',
    stage: 'queued',
    current: 0,
    total: 0,
    message: 'Starting…',
    result: null,
    error: null,
    errorCode: null,
    details: null,
    startedAt: now,
    updatedAt: now,
  };
  jobs.set(id, job);
  return job;
}

function patchJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: new Date() });
  return job;
}

function getJobForUser(jobId, userId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  if (String(job.userId) !== String(userId)) return null;
  return serializeJob(job);
}

function serializeJob(job) {
  return {
    id: job.id,
    type: job.type,
    source: job.source,
    status: job.status,
    stage: job.stage,
    current: job.current,
    total: job.total,
    message: job.message,
    partial: job.partial || null,
    result: job.result,
    error: job.error,
    errorCode: job.errorCode,
    details: job.details,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
  };
}

function progressReporter(jobId) {
  return (update = {}) => {
    const patch = { status: 'running' };
    if (update.stage != null) patch.stage = update.stage;
    if (update.current != null) patch.current = update.current;
    if (update.total != null) patch.total = update.total;
    if (update.message != null) patch.message = update.message;
    // Partial execute tallies for live UI
    if (update.partial != null) patch.partial = update.partial;
    patchJob(jobId, patch);
  };
}

function failJob(jobId, error) {
  patchJob(jobId, {
    status: 'error',
    stage: 'error',
    error: error.message || 'Import job failed',
    errorCode: error.code || null,
    details: error.details || null,
    message: error.message || 'Import job failed',
  });
}

function completeJob(jobId, result) {
  const job = jobs.get(jobId);
  patchJob(jobId, {
    status: 'complete',
    stage: 'done',
    current: job?.total || job?.current || 0,
    message: 'Done',
    result,
    partial: null,
  });
}

function startPreviewJob(userId, source, { limit, crossRefMode } = {}) {
  const job = createJob({ userId, type: 'preview', source });
  const onProgress = progressReporter(job.id);

  setImmediate(async () => {
    try {
      patchJob(job.id, { status: 'running', stage: 'starting', message: 'Starting scan…' });
      const preview = source === 'soundcloud'
        ? await libraryImportService.previewSoundCloudImport(userId, limit, {
          onProgress,
          crossRefMode: crossRefMode || 'spotify_only',
        })
        : await libraryImportService.previewSpotifyImport(userId, limit, { onProgress });
      completeJob(job.id, preview);
    } catch (error) {
      console.error(`[libraryImportJob] preview ${source} failed:`, error.message);
      failJob(job.id, error);
    }
  });

  return { jobId: job.id };
}

function startExecuteJob(userId, source, { items, defaultTip } = {}) {
  const job = createJob({ userId, type: 'execute', source });
  const onProgress = progressReporter(job.id);

  setImmediate(async () => {
    try {
      patchJob(job.id, { status: 'running', stage: 'starting', message: 'Starting import…' });
      const results = source === 'soundcloud'
        ? await libraryImportService.executeSoundCloudImport(userId, { items, defaultTip, onProgress })
        : await libraryImportService.executeSpotifyImport(userId, { items, defaultTip, onProgress });

      completeJob(job.id, {
        success: true,
        ...results,
        totalSpent: results.totalSpentPence / 100,
        updatedBalance: results.updatedBalance / 100,
      });
    } catch (error) {
      console.error(`[libraryImportJob] execute ${source} failed:`, error.message);
      failJob(job.id, error);
    }
  });

  return { jobId: job.id };
}

module.exports = {
  startPreviewJob,
  startExecuteJob,
  getJobForUser,
};
