import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getApplicationAdapter,
  isConfirmationText,
  isConfirmationUrl,
} from './apply/adapters.js';

test('detects supported ATS adapters from application URLs', () => {
  assert.equal(getApplicationAdapter('https://boards.greenhouse.io/acme/jobs/1').id, 'greenhouse');
  assert.equal(getApplicationAdapter('https://jobs.lever.co/acme/123').id, 'lever');
  assert.equal(getApplicationAdapter('https://apply.workable.com/acme/j/1/').id, 'workable');
  assert.equal(getApplicationAdapter('https://jobs.ashbyhq.com/acme/1').id, 'ashby');
  assert.equal(getApplicationAdapter('https://example.com/jobs/1').id, 'generic');
});

test('recognizes adapter-specific submission confirmation text', () => {
  const greenhouse = getApplicationAdapter('https://boards.greenhouse.io/acme/jobs/1');
  const lever = getApplicationAdapter('https://jobs.lever.co/acme/123');

  assert.equal(isConfirmationText('Thanks for applying to Acme.', greenhouse), true);
  assert.equal(isConfirmationText('Your application was received.', lever), true);
  assert.equal(isConfirmationText('Please complete your profile.', greenhouse), false);
});

test('recognizes confirmation URLs only', () => {
  assert.equal(isConfirmationUrl('https://jobs.example.com/application/confirmation'), true);
  assert.equal(isConfirmationUrl('https://jobs.example.com/apply/123'), false);
});
