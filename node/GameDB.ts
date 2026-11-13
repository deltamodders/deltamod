import fs from 'fs';
import path from 'path';

import console from './Console.js';
import { DELTAMOD_DIR } from './Paths';

import type { AutodownloadGameJolt } from './DownloadUtilities/GameJolt.js';
import type { AutodownloadItch } from './DownloadUtilities/Itch.js';

type MkFeat<Ident, Data> = { feat: Ident, data: Data };

export type FeatureAutodownload = AutodownloadGameJolt | AutodownloadItch;

export interface FeatureSteam {
    folder: string;
    appid: string;
    downloadable: boolean;
}

type TypedFeature = MkFeat<"autodownload", FeatureAutodownload> | MkFeat<"steam", FeatureSteam>;

type UntypedFeature = { feat: string; data: any; };

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
let cached: GameInfo[] | null = null;

export function getGames() {
    if (!cached) {
        cached = fs.readdirSync(GAMES_BASE).map(x => {
            return JSON.parse(fs.readFileSync(path.join(GAMES_BASE, x), 'utf8'));
        });
    }
    return cached!;
}

export function getGameById(id: string): GameInfo {
    const res = getGames().find(g => g.id == id);
    if (res === undefined) throw new Error(`Unknown game: ${id}`);
    return res;
}

export function getFeatInfo(id: string, feat: string): FeatureInfo | false | undefined {
    const game = getGameById(id);
    if (!game.availableFeatures) return false;
    return game.availableFeatures.find(f => f.feat == feat);
}

export function getFeatInfoUnchecked(id: string, feat: string): FeatureInfo {
    const res = getFeatInfo(id, feat);
    if (!res) throw new Error(`game ${id} doesn't have feature `);
    return res;
}
