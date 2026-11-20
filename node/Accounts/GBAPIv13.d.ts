export interface CollectionItemsRecord {
    _idRow: number;
    _sModelName: "Mod" | string;
}

interface CollectionItemsMetadata {
    _nRecordCount: number;
    _nPerpage: number;
    _bIsComplete: boolean;
}

export interface CollectionItems {
    _aMetadata: CollectionItemsMetadata;
    _aRecords?: CollectionItemsRecord[] | null;
}

export interface XFile {
    _aModManagerIntegrations: { _idToolRow: number }[],
    _sDownloadUrl: string,
    _sFile: string,
}

export interface XProfilePage {
    _sName: string,
    _aFiles?: XFile[] | null;
}
