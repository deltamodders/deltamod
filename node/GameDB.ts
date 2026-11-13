import fs from 'fs';
import path from 'path';

import console from './Console';
import type { AutodownloadGameJolt } from './DownloadUtilities/GameJolt';
import type { AutodownloadItch } from './DownloadUtilities/Itch';
import { DELTAMOD_DIR } from './Paths';

type MkFeat<Ident, Data> = { feat: Ident; data: Data; };

type FeatureAutodownload = AutodownloadGameJolt | AutodownloadItch;

interface FeatureSteam {
    folder: string;
    appid: string;
    downloadable: boolean;
}

type TypedFeature = MkFeat<"autodownload", FeatureAutodownload> | MkFeat<"steam", FeatureSteam>;

type UntypedFeature = { feat: string, data: any };

type FeatureInfo = TypedFeature | UntypedFeature;

interface GameInfo {
    name: string;
    author: string;
    id: string;
    gamebanana: { id: string; };
    exeName: string;
    availableFeatures: FeatureInfo[];
}

const GAMES_BASE = path.join(DELTAMOD_DIR, 'games');
let cached: GameInfo[] = fs.readdirSync(GAMES_BASE).map(x => {
    return JSON.parse(fs.readFileSync(path.join(GAMES_BASE, x), 'utf8'));
});

export function getGames(): GameInfo[] {
    return cached;
}

export function getGameById(id: string): GameInfo | undefined {
    return getGames().find(g => g.id == id);
}

export function getFeatInfo(id: string, feat: string): FeatureInfo | false | undefined {
    const game = getGameById(id);
    if (!game || !game.availableFeatures) return false;
    return game.availableFeatures.find(f => f.feat == feat);
}

export function getFeatInfoChecked(id: string, feat: string): FeatureInfo {
    const res = getFeatInfo(id, feat);
    if (!res) throw new Error(`game ${id} doesn't have feature `);
    return res;
}

export function getGameName(id: string): string | null {
    const game = getGameById(id);
    if (!game) return null;
    return game.name;
}

getGames();
