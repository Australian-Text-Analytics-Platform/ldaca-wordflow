import { beforeEach, describe, expect, it } from 'vitest';
import { useFreshNodesStore } from '../freshNodesStore';

describe('useFreshNodesStore', () => {
  beforeEach(() => {
    useFreshNodesStore.getState().reset();
  });

  it('does not mark loaded Project nodes as new', () => {
    useFreshNodesStore.getState().reconcileNodeIds('project-a', ['a', 'b', 'c']);
    expect(useFreshNodesStore.getState().freshIdsByProject.has('project-a')).toBe(false);
  });

  it('marks only explicitly created Data Blocks as new', () => {
    useFreshNodesStore.getState().reconcileNodeIds('project-a', ['existing']);
    useFreshNodesStore.getState().markCreated('project-a', ['created']);
    useFreshNodesStore.getState().reconcileNodeIds('project-a', ['existing', 'created']);

    expect(useFreshNodesStore.getState().freshIdsByProject.get('project-a')).toEqual(
      new Set(['created']),
    );
  });

  it('marks multiple backend-confirmed creations idempotently', () => {
    useFreshNodesStore.getState().markCreated('project-a', ['a', 'b']);
    useFreshNodesStore.getState().markCreated('project-a', ['b', 'c']);
    expect(useFreshNodesStore.getState().freshIdsByProject.get('project-a')).toEqual(
      new Set(['a', 'b', 'c']),
    );
  });

  it('clears a marker after interaction', () => {
    useFreshNodesStore.getState().markCreated('project-a', ['a', 'b']);
    useFreshNodesStore.getState().markInteracted('project-a', ['a']);
    expect(useFreshNodesStore.getState().freshIdsByProject.get('project-a')).toEqual(
      new Set(['b']),
    );
  });

  it('removes markers for deleted Data Blocks without marking new graph arrivals', () => {
    useFreshNodesStore.getState().markCreated('project-a', ['created', 'deleted']);
    useFreshNodesStore.getState().reconcileNodeIds('project-a', ['existing', 'created']);
    expect(useFreshNodesStore.getState().freshIdsByProject.get('project-a')).toEqual(
      new Set(['created']),
    );
  });

  it('tracks overlapping IDs independently per Project', () => {
    useFreshNodesStore.getState().markCreated('project-a', ['shared']);
    useFreshNodesStore.getState().markCreated('project-b', ['shared']);
    useFreshNodesStore.getState().markInteracted('project-a', ['shared']);

    expect(useFreshNodesStore.getState().freshIdsByProject.has('project-a')).toBe(false);
    expect(useFreshNodesStore.getState().freshIdsByProject.get('project-b')).toEqual(
      new Set(['shared']),
    );
  });

  it('skips empty project and Data Block IDs', () => {
    useFreshNodesStore.getState().markCreated('', ['a']);
    useFreshNodesStore.getState().markCreated('project-a', ['', 'a']);
    expect(useFreshNodesStore.getState().freshIdsByProject.get('project-a')).toEqual(
      new Set(['a']),
    );
  });

  it('reset clears every Project marker', () => {
    useFreshNodesStore.getState().markCreated('project-a', ['a']);
    useFreshNodesStore.getState().markCreated('project-b', ['b']);
    useFreshNodesStore.getState().reset();
    expect(useFreshNodesStore.getState().freshIdsByProject.size).toBe(0);
  });
});
