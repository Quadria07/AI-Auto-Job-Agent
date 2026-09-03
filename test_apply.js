import { applyToJob } from './apply/engine.js';
import { readJobs } from './data/store.js';

async function run() {
  const jobs = await readJobs();
  const job = jobs.find(j => j.title.includes('Enfold') || j.title.includes('Senior WordPress Developer'));
  if (job) {
    console.log("Testing job:", job.title);
    await applyToJob(job);
  } else {
    console.log("Job not found in database.");
  }
}
run();
