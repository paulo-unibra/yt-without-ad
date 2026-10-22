import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBackendUrl } from '../utils/backend-url.ts';

const dev = { platform: 'android', isDevelopment: true };

test('uses the current Metro host instead of a fixed LAN IP', () => {
  assert.equal(resolveBackendUrl({ ...dev, hostUri: '192.168.1.15:8081' }), 'http://192.168.1.15:3001');
  assert.equal(resolveBackendUrl({ ...dev, hostUri: '192.168.1.99:8081' }), 'http://192.168.1.99:3001');
});

test('explicit backend URL takes precedence, including in installed builds', () => {
  assert.equal(resolveBackendUrl({ ...dev, configuredUrl: ' https://streams.example.com/api/ ', hostUri: '192.168.1.15:8081', isDevelopment: false }), 'https://streams.example.com/api');
});

test('uses the Android emulator host for localhost and missing Metro hosts', () => {
  assert.equal(resolveBackendUrl({ ...dev }), 'http://10.0.2.2:3001');
  assert.equal(resolveBackendUrl({ ...dev, hostUri: 'localhost:8081' }), 'http://10.0.2.2:3001');
  assert.equal(resolveBackendUrl({ ...dev, platform: 'ios' }), 'http://localhost:3001');
});

test('does not send production requests to a development address', () => {
  assert.equal(resolveBackendUrl({ ...dev, hostUri: '192.168.1.15:8081', isDevelopment: false }), null);
});

test('does not mistake the Expo tunnel for a backend tunnel', () => {
  assert.equal(resolveBackendUrl({ ...dev, hostUri: 'project.exp.direct' }), null);
});

test('rejects malformed or non-HTTP configured addresses', () => {
  for (const configuredUrl of ['192.168.1.15:3001', 'file:///tmp/video', 'invalid']) {
    assert.equal(resolveBackendUrl({ ...dev, configuredUrl }), null);
  }
});

test('supports IPv6 Metro hosts and removes Metro path/query parameters', () => {
  assert.equal(resolveBackendUrl({ ...dev, hostUri: 'http://[fd00::1]:8081/path?dev=true' }), 'http://[fd00::1]:3001');
});
