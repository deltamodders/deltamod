type SnapDir = { directory: true };
type SnapFile = { size: number, sha256: string };
type SnapshotEntry = SnapDir | SnapFile;
export type Snapshot = Record<string, SnapDir | SnapshotEntry>;

export interface Owner {
    version: number,
    // invariant: presumably UUID???
    id: string,
}
