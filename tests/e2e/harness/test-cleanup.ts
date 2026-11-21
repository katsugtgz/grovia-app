import { afterAll } from 'bun:test';
import { cleanupDefaultTestDbFiles } from './test-client';

afterAll(() => {
  cleanupDefaultTestDbFiles();
});
