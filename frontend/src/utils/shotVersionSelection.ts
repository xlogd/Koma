import type { Shot, ShotMeta, StoredMediaAsset } from '../types';

function mediaIdentityValues(asset?: StoredMediaAsset): string[] {
  if (!asset) return [];
  return [
    asset.localPath,
    asset.remoteUrl,
    asset.providerTaskId,
  ].filter((value): value is string => Boolean(value));
}

export function isSameStoredMediaAsset(
  left?: StoredMediaAsset,
  right?: StoredMediaAsset,
): boolean {
  const leftValues = mediaIdentityValues(left);
  const rightValues = new Set(mediaIdentityValues(right));
  return leftValues.some(value => rightValues.has(value));
}

function findAssetIndex(
  assets: StoredMediaAsset[] | undefined,
  target: StoredMediaAsset | undefined,
): number {
  if (!assets?.length || !target) return -1;
  return assets.findIndex(asset => isSameStoredMediaAsset(asset, target));
}

function ensureAssetSelected(
  assets: StoredMediaAsset[] | undefined,
  target: StoredMediaAsset | undefined,
): { assets: StoredMediaAsset[] | undefined; index: number | undefined; changed: boolean } {
  if (!target) {
    return { assets, index: undefined, changed: false };
  }

  const current = assets ? [...assets] : [];
  const existingIndex = findAssetIndex(current, target);
  if (existingIndex >= 0) {
    return { assets: current, index: existingIndex, changed: false };
  }

  current.push(target);
  return { assets: current, index: current.length - 1, changed: true };
}

export function syncShotSelectionFromVersionMeta(shot: Shot, meta?: ShotMeta): Shot {
  if (!meta?.versions?.length) return shot;

  const selectedVersion = meta.versions.find(version => version.version === meta.currentVersion);
  const selectedVideo = selectedVersion?.media?.video;
  if (!selectedVersion || !selectedVideo) {
    return {
      ...shot,
      currentVersion: meta.currentVersion,
    };
  }

  const videosResult = ensureAssetSelected(shot.media?.videos, selectedVideo);
  const currentVideoIndex = videosResult.index ?? shot.media?.currentVideoIndex;
  const media = {
    ...(shot.media || {}),
    ...(videosResult.assets ? { videos: videosResult.assets } : {}),
    ...(currentVideoIndex !== undefined ? { currentVideoIndex } : {}),
  };

  return {
    ...shot,
    currentVersion: meta.currentVersion,
    media,
  };
}

export function syncShotsSelectionFromVersionMetas(shots: Shot[], metas: ShotMeta[]): Shot[] {
  if (!shots.length || !metas.length) return shots;
  const metaByShotId = new Map(metas.map(meta => [meta.id, meta]));
  return shots.map(shot => syncShotSelectionFromVersionMeta(shot, metaByShotId.get(shot.id)));
}

export function findVersionNumberForVideoAsset(
  meta: ShotMeta | undefined,
  asset: StoredMediaAsset | undefined,
): number | undefined {
  if (!meta || !asset) return undefined;
  const version = meta.versions.find(item => isSameStoredMediaAsset(item.media?.video, asset));
  return version?.version;
}
