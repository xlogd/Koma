import { describe, expect, it } from 'vitest';
import type { Shot, ShotMeta, StoredMediaAsset } from '../types';
import {
  findVersionNumberForVideoAsset,
  syncShotSelectionFromVersionMeta,
} from './shotVersionSelection';

function video(localPath: string, createdAt = 1): StoredMediaAsset {
  return { kind: 'video', localPath, createdAt };
}

function shot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot-1',
    scriptLines: [],
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 5,
    characters: [],
    media: {
      videos: [video('/v1.mp4'), video('/v2.mp4')],
      currentVideoIndex: 0,
    },
    ...overrides,
  };
}

function meta(currentVersion: number): ShotMeta {
  return {
    id: 'shot-1',
    prompt: '',
    seed: 0,
    model: '',
    currentVersion,
    versions: [
      { version: 1, prompt: '', seed: 1, model: 'm', createdAt: 1, media: { video: video('/v1.mp4') } },
      { version: 2, prompt: '', seed: 2, model: 'm', createdAt: 2, media: { video: video('/v2.mp4') } },
    ],
  };
}

describe('shotVersionSelection', () => {
  it('sets currentVideoIndex from the selected shot meta version', () => {
    const synced = syncShotSelectionFromVersionMeta(shot(), meta(2));

    expect(synced.currentVersion).toBe(2);
    expect(synced.media?.currentVideoIndex).toBe(1);
  });

  it('appends missing version media so downstream selectors can read it', () => {
    const synced = syncShotSelectionFromVersionMeta(
      shot({ media: { videos: [video('/v1.mp4')], currentVideoIndex: 0 } }),
      meta(2),
    );

    expect(synced.media?.videos?.map(item => item.localPath)).toEqual(['/v1.mp4', '/v2.mp4']);
    expect(synced.media?.currentVideoIndex).toBe(1);
  });

  it('finds a version number for a selected video asset', () => {
    expect(findVersionNumberForVideoAsset(meta(1), video('/v2.mp4'))).toBe(2);
  });
});
