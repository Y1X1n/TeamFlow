import { describe, expect, it } from 'vitest';
import {
  PERMISSION_KEYS,
  ROLE_PRESETS,
  hasPermission,
  invalidPermissionKeys,
  resolvePermissions,
} from '../permissions';

describe('permissions', () => {
  it('defines 17 permissions', () => {
    expect(PERMISSION_KEYS).toHaveLength(17);
    expect(new Set(PERMISSION_KEYS).size).toBe(17);
  });

  it('owner always has every permission, ignoring overrides', () => {
    expect(resolvePermissions('OWNER', { 'task:move': false })).toEqual([...PERMISSION_KEYS]);
    expect(hasPermission('OWNER', { 'project:delete': false }, 'project:delete')).toBe(true);
  });

  it('applies member presets and overrides', () => {
    expect(ROLE_PRESETS.MEMBER).toHaveLength(8);
    expect(hasPermission('MEMBER', null, 'task:move')).toBe(true);
    expect(hasPermission('MEMBER', { 'task:move': false }, 'task:move')).toBe(false);
    expect(hasPermission('MEMBER', { 'board:manage': true }, 'board:manage')).toBe(true);
    expect(hasPermission('MEMBER', null, 'project:delete')).toBe(false);
  });

  it('viewer is read-only except comments', () => {
    expect(resolvePermissions('VIEWER')).toEqual(['comment:create', 'report:view']);
  });

  it('never grants owner-only permissions through overrides', () => {
    expect(hasPermission('ADMIN', { 'project:delete': true }, 'project:delete')).toBe(false);
    expect(hasPermission('MEMBER', { 'project:delete': true }, 'project:delete')).toBe(false);
    expect(hasPermission('OWNER', null, 'project:delete')).toBe(true);
  });

  it('ignores unknown override keys when resolving', () => {
    const result = resolvePermissions('MEMBER', {
      'unknown:key': true,
    } as unknown as Record<'task:move', boolean>);
    expect(result).toEqual(resolvePermissions('MEMBER'));
  });

  it('reports invalid override keys', () => {
    expect(invalidPermissionKeys({ 'task:move': true, 'foo:bar': false })).toEqual(['foo:bar']);
  });
});
